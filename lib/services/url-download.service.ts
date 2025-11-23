import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { urlValidationService, type UrlType } from './url-validation.service';

const execAsync = promisify(exec);

export interface UrlDownloadOptions {
  url: string;
  type: UrlType;
  outputPath: string;
}

export interface UrlDownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  fileName?: string;
  format?: string;
  error?: string;
  metadata?: {
    title?: string;
    duration?: number;
    uploader?: string;
  };
}

export class UrlDownloadService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'kowiz-downloads');
  }

  /**
   * Initialize temp directory
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Download media from URL
   */
  async download(options: UrlDownloadOptions): Promise<UrlDownloadResult> {
    try {
      await this.init();

      if (options.type === 'youtube') {
        return await this.downloadWithYtDlp(options.url, options.outputPath);
      } else if (options.type === 'direct') {
        return await this.downloadDirect(options.url, options.outputPath);
      } else {
        throw new Error(`Unsupported URL type: ${options.type}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error',
      };
    }
  }

  /**
   * Download using yt-dlp (supports YouTube, Vimeo, and 1000+ sites)
   * Uses multiple strategies to bypass YouTube bot detection
   */
  private async downloadWithYtDlp(url: string, outputPath: string): Promise<UrlDownloadResult> {
    // Clean up any orphaned files from previous attempts before starting retry loop
    // This must happen once before the loop, not inside each retry attempt,
    // to avoid deleting valid downloads from previous attempts
    const tempFileName = path.basename(outputPath, path.extname(outputPath));
    const outputDir = path.dirname(outputPath);
    await this.cleanupOrphanedFiles(outputDir, tempFileName);
    
    // Try different player clients in order of preference
    // These don't require JavaScript runtime and are less likely to trigger bot detection
    const playerClients = ['android', 'ios', 'web', 'mweb', 'tv_embedded'];
    
    let lastError: Error | null = null;
    
    for (const playerClient of playerClients) {
      try {
        console.log(`Attempting download with player client: ${playerClient}...`);
        return await this.downloadWithPlayerClient(url, outputPath, playerClient);
      } catch (error) {
        console.warn(`Failed with player client ${playerClient}:`, error instanceof Error ? error.message : error);
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next player client
      }
    }
    
    // If all player clients failed, throw the last error
    throw new Error(`yt-dlp download failed after trying all player clients: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Download with a specific YouTube player client
   */
  private async downloadWithPlayerClient(
    url: string, 
    outputPath: string, 
    playerClient: string
  ): Promise<UrlDownloadResult> {
    // Build common yt-dlp arguments for bypassing restrictions
    // Using player_client avoids JavaScript runtime requirement and reduces bot detection
    const commonArgs = [
      `--extractor-args "youtube:player_client=${playerClient}"`,
      '--user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
      '--referer "https://www.youtube.com/"',
      '--no-warnings',
      '--no-playlist',
      '--extractor-retries 3',
      '--fragment-retries 3',
      '--retries 3',
    ];

    // First, get video info without downloading
    console.log('Fetching video metadata...');
    const infoArgs = [
      '--dump-json',
      ...commonArgs,
      `"${url}"`,
    ];
    const infoCommand = `yt-dlp ${infoArgs.join(' ')}`;
    
    const { stdout: infoJson } = await execAsync(infoCommand, { 
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000, // 2 minute timeout for metadata
    });
    
    const metadata = JSON.parse(infoJson);
    console.log(`✓ Found: ${metadata.title} by ${metadata.uploader || 'Unknown'}`);
    
    // Use a safe, short filename to avoid filesystem length limits
    const tempFileName = path.basename(outputPath, path.extname(outputPath));
    const outputDir = path.dirname(outputPath);
    const outputTemplate = path.join(outputDir, `${tempFileName}.%(ext)s`);
    
    // Track existing files BEFORE download to identify newly created files
    // This is more reliable than timestamps and prevents picking up files from previous attempts
    const existingFiles = await this.getExistingFiles(outputDir, tempFileName);
    
    // Build download command with format preferences
    const downloadArgs = [
      '--format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
      '--merge-output-format mp4',
      `--output "${outputTemplate}"`,
      ...commonArgs,
      `"${url}"`,
    ];
    const downloadCommand = `yt-dlp ${downloadArgs.join(' ')}`;
    
    console.log('Downloading video...');
    const { stdout: downloadOutput } = await execAsync(downloadCommand, { 
      maxBuffer: 50 * 1024 * 1024,
      timeout: 600000, // 10 minute timeout
    });
    
    // Find the downloaded file that didn't exist before this download attempt
    const downloadedFile = await this.findDownloadedFile(outputDir, tempFileName, existingFiles);
    
    if (!downloadedFile) {
      throw new Error('Downloaded file not found');
    }
    
    // Rename to final output path if needed
    if (downloadedFile !== outputPath) {
      await fs.rename(downloadedFile, outputPath);
    }
    
    const stats = await fs.stat(outputPath);
    
    // Use a cleaned version of the title for the filename
    const cleanTitle = this.sanitizeFileName(metadata.title);
    
    return {
      success: true,
      filePath: outputPath,
      fileSize: stats.size,
      fileName: cleanTitle,
      format: metadata.ext || 'mp4',
      metadata: {
        title: metadata.title,
        duration: metadata.duration,
        uploader: metadata.uploader,
      },
    };
  }

  /**
   * Download from direct URL
   */
  private async downloadDirect(url: string, outputPath: string): Promise<UrlDownloadResult> {
    try {
      console.log('Downloading from direct URL...');
      
      // Use curl for direct downloads
      const command = `curl -L -o "${outputPath}" "${url}"`;
      
      await execAsync(command, { 
        maxBuffer: 100 * 1024 * 1024,
        timeout: 600000, // 10 minute timeout
      });
      
      const stats = await fs.stat(outputPath);
      
      // Extract filename from URL
      const urlPath = new URL(url).pathname;
      const fileName = path.basename(urlPath);
      const extension = path.extname(fileName).slice(1) || 'bin';
      
      return {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        fileName,
        format: extension,
      };
    } catch (error) {
      throw new Error(`Direct download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up orphaned files from previous download attempts
   */
  private async cleanupOrphanedFiles(directory: string, tempFileName: string): Promise<void> {
    try {
      const files = await fs.readdir(directory);
      const sanitizedTitle = tempFileName.replace(/[^\w\s-]/g, '');
      const prefix = sanitizedTitle.substring(0, 20);
      
      // Find files matching our pattern (include all video formats that yt-dlp might produce)
      const orphanedFiles = files.filter(file => 
        file.includes(prefix) && (
          file.endsWith('.mp4') || 
          file.endsWith('.m4a') || 
          file.endsWith('.webm') || 
          file.endsWith('.mkv')
        )
      );
      
      // Clean up orphaned files
      for (const file of orphanedFiles) {
        try {
          const filePath = path.join(directory, file);
          await fs.unlink(filePath);
          console.log(`Cleaned up orphaned file: ${file}`);
        } catch (error) {
          // Ignore errors when cleaning up (file might not exist or be locked)
          console.warn(`Failed to cleanup orphaned file ${file}:`, error);
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during orphaned file cleanup:', error);
    }
  }

  /**
   * Get set of existing files matching the pattern before download starts
   */
  private async getExistingFiles(directory: string, tempFileName: string): Promise<Set<string>> {
    try {
      const files = await fs.readdir(directory);
      const sanitizedTitle = tempFileName.replace(/[^\w\s-]/g, '');
      const prefix = sanitizedTitle.substring(0, 20);
      
      // Get all files matching our pattern that exist before download
      const videoExtensions = ['.mp4', '.webm', '.mkv', '.m4a'];
      const existingFiles = files.filter(file => {
        const matchesPrefix = file.includes(prefix);
        const isVideoOrAudio = videoExtensions.some(ext => file.endsWith(ext));
        return matchesPrefix && isVideoOrAudio;
      });
      
      return new Set(existingFiles);
    } catch (error) {
      console.warn('Error getting existing files:', error);
      return new Set(); // Return empty set on error to be safe
    }
  }

  /**
   * Find downloaded file in directory, excluding files that existed before download started
   * This is more reliable than timestamp-based filtering
   */
  private async findDownloadedFile(
    directory: string, 
    titlePattern: string, 
    existingFilesBefore: Set<string>
  ): Promise<string | null> {
    try {
      const files = await fs.readdir(directory);
      
      // Look for files matching the pattern
      const sanitizedTitle = titlePattern.replace(/[^\w\s-]/g, '');
      const prefix = sanitizedTitle.substring(0, 20);
      
      // Filter video files: must be a video format AND match prefix
      // Prefix is always required to prevent concurrent downloads from picking up each other's files
      const videoExtensions = ['.mp4', '.webm', '.mkv'];
      const audioExtensions = ['.m4a']; // Audio files are lower priority (intermediate files from yt-dlp)
      
      // Only consider files that didn't exist before this download attempt
      const candidateFiles = files.filter(file => {
        // Must not have existed before download started
        if (existingFilesBefore.has(file)) return false;
        
        const isVideoFile = videoExtensions.some(ext => file.endsWith(ext));
        const isAudioFile = audioExtensions.some(ext => file.endsWith(ext));
        if (!isVideoFile && !isAudioFile) return false;
        
        // Always require prefix match to ensure we only consider files from this download attempt
        return file.includes(prefix);
      });
      
      if (candidateFiles.length === 0) {
        return null;
      }
      
      // Get file stats for prioritization
      const fileStats = await Promise.all(
        candidateFiles.map(async (file) => {
          try {
            const filePath = path.join(directory, file);
            const stats = await fs.stat(filePath);
            const isVideoFile = videoExtensions.some(ext => file.endsWith(ext));
            const isAudioFile = audioExtensions.some(ext => file.endsWith(ext));
            return {
              path: filePath,
              name: file,
              mtime: stats.mtimeMs,
              ctime: stats.ctimeMs,
              isVideo: isVideoFile,
              isAudio: isAudioFile,
            };
          } catch (error) {
            return null;
          }
        })
      );
      
      // Filter out null results
      const validFiles = fileStats.filter((stat): stat is NonNullable<typeof stat> => stat !== null);
      
      if (validFiles.length === 0) {
        return null;
      }
      
      // Prioritize video files over audio files, then sort by modification time (most recent first)
      // This ensures we don't return intermediate .m4a audio files when video files are available
      validFiles.sort((a, b) => {
        // First priority: video files over audio files
        if (a.isVideo && !b.isVideo) return -1;
        if (!a.isVideo && b.isVideo) return 1;
        // Second priority: most recent modification time
        return b.mtime - a.mtime;
      });
      
      return validFiles[0].path;
    } catch (error) {
      console.error('Error finding downloaded file:', error);
      return null;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Failed to cleanup file ${filePath}:`, error);
    }
  }

  /**
   * Get temporary file path
   */
  getTempPath(filename: string): string {
    return path.join(this.tempDir, filename);
  }

  /**
   * Sanitize filename to safe length and characters
   */
  private sanitizeFileName(title: string): string {
    // Remove special characters and limit length
    const sanitized = title
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-')      // Remove duplicate hyphens
      .substring(0, 100);       // Limit to 100 characters
    
    return sanitized || 'video';
  }
}

export const urlDownloadService = new UrlDownloadService();

