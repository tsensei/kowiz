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
   */
  private async downloadWithYtDlp(url: string, outputPath: string): Promise<UrlDownloadResult> {
    try {
      // First, get video info without downloading
      console.log('Fetching video metadata...');
      const infoCommand = `yt-dlp --dump-json "${url}"`;
      const { stdout: infoJson } = await execAsync(infoCommand, { maxBuffer: 10 * 1024 * 1024 });
      
      const metadata = JSON.parse(infoJson);
      console.log(`✓ Found: ${metadata.title} by ${metadata.uploader || 'Unknown'}`);
      
      // Use a safe, short filename to avoid filesystem length limits
      // We'll use the outputPath directly instead of a template
      const tempFileName = path.basename(outputPath, path.extname(outputPath));
      const outputTemplate = path.join(path.dirname(outputPath), `${tempFileName}.%(ext)s`);
      
      const downloadCommand = `yt-dlp \
        --format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
        --merge-output-format mp4 \
        --output "${outputTemplate}" \
        --no-playlist \
        --no-warnings \
        "${url}"`;
      
      console.log('Downloading video...');
      const { stdout: downloadOutput } = await execAsync(downloadCommand, { 
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000, // 10 minute timeout
      });
      
      // Find the downloaded file (should match our template)
      const downloadedFile = await this.findDownloadedFile(path.dirname(outputPath), tempFileName);
      
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
    } catch (error) {
      throw new Error(`yt-dlp download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
   * Find downloaded file in directory
   */
  private async findDownloadedFile(directory: string, titlePattern: string): Promise<string | null> {
    try {
      const files = await fs.readdir(directory);
      
      // Look for file matching the title
      const sanitizedTitle = titlePattern.replace(/[^\w\s-]/g, '');
      const matchingFile = files.find(file => 
        file.includes(sanitizedTitle.substring(0, 20)) || file.endsWith('.mp4')
      );
      
      if (matchingFile) {
        return path.join(directory, matchingFile);
      }
      
      // Return the most recent MP4 file
      const mp4Files = files.filter(f => f.endsWith('.mp4'));
      if (mp4Files.length > 0) {
        return path.join(directory, mp4Files[0]);
      }
      
      return null;
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

