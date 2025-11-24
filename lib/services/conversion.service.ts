import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ConversionOptions {
  inputPath: string;
  outputPath: string;
  sourceFormat: string;
  targetFormat: string;
  category: 'image' | 'video' | 'audio' | 'raw';
}

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  outputSize?: number;
  error?: string;
}

export class ConversionService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'kowiz-conversions');
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
   * Convert media file based on category
   */
  async convert(options: ConversionOptions): Promise<ConversionResult> {
    try {
      await this.init();

      switch (options.category) {
        case 'image':
          return await this.convertImage(options);
        case 'raw':
          return await this.convertRaw(options);
        case 'video':
          return await this.convertVideo(options);
        case 'audio':
          return await this.convertAudio(options);
        default:
          throw new Error(`Unsupported category: ${options.category}`);
      }
    } catch (error) {
      console.error('Conversion error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown conversion error',
      };
    }
  }

  /**
   * Convert RAW files using dcraw_emu
   */
  private async convertRaw(options: ConversionOptions): Promise<ConversionResult> {
    const { inputPath, outputPath, targetFormat } = options;

    try {
      // Convert RAW to TIFF using dcraw_emu (from libraw-bin, has better CR3 support)
      // -T: Write TIFF instead of PPM
      // -6: 16-bit output
      // -w: Use camera white balance
      // -Z -: Output to stdout (then redirect to file)
      // Creates an everyday, viewable TIFF: 16-bit, sRGB-ish, camera WB, gamma-corrected

      console.log('Converting RAW using dcraw_emu (16-bit, sRGB-ish, camera WB, gamma-corrected)...');

      // Everyday, viewable TIFF: 16-bit, sRGB-ish, camera WB, gamma-corrected
      await execAsync(`dcraw_emu -T -6 -w -Z - "${inputPath}" > "${outputPath}"`);

      // Verify output exists and has size > 0
      const stats = await fs.stat(outputPath);
      if (stats.size === 0) {
        throw new Error('dcraw_emu produced empty file');
      }

      return {
        success: true,
        outputPath,
        outputSize: stats.size,
      };
    } catch (error) {
      console.error('RAW conversion failed:', error);
      throw new Error(`RAW conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert image formats using ImageMagick (or FFmpeg as fallback)
   */
  private async convertImage(options: ConversionOptions): Promise<ConversionResult> {
    const { inputPath, outputPath, sourceFormat, targetFormat } = options;

    try {
      // Try ImageMagick first (if available)
      try {
        await execAsync('convert -version');

        // ImageMagick conversion
        let command = `convert "${inputPath}"`;

        // Quality settings based on target format
        if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
          command += ' -quality 95';
        } else if (targetFormat === 'png') {
          command += ' -quality 100';
        } else if (targetFormat === 'tiff') {
          command += ' -compress lzw';
        }

        command += ` "${outputPath}"`;

        await execAsync(command, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer
      } catch (imageMagickError) {
        // Fallback to FFmpeg for image conversion
        console.log('ImageMagick not available, using FFmpeg for image conversion');

        let command = `ffmpeg -i "${inputPath}"`;

        // Quality settings
        if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
          command += ' -q:v 2'; // High quality JPEG
        }

        command += ` -y "${outputPath}"`;

        await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
      }

      const stats = await fs.stat(outputPath);

      return {
        success: true,
        outputPath,
        outputSize: stats.size,
      };
    } catch (error) {
      throw new Error(`Image conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert video to WebM format using FFmpeg
   */
  private async convertVideo(options: ConversionOptions): Promise<ConversionResult> {
    const { inputPath, outputPath } = options;

    try {
      // Convert to WebM with VP9 video codec and Opus audio codec
      // Optimized settings for Wikimedia Commons
      const command = `ffmpeg -i "${inputPath}" \
        -c:v libvpx-vp9 \
        -b:v 2M \
        -crf 30 \
        -c:a libopus \
        -b:a 128k \
        -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
        -threads 4 \
        -deadline good \
        -cpu-used 2 \
        -y "${outputPath}"`;

      await execAsync(command, { maxBuffer: 100 * 1024 * 1024 }); // 100MB buffer

      const stats = await fs.stat(outputPath);

      return {
        success: true,
        outputPath,
        outputSize: stats.size,
      };
    } catch (error) {
      throw new Error(`Video conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert audio to Ogg Vorbis format using FFmpeg
   */
  private async convertAudio(options: ConversionOptions): Promise<ConversionResult> {
    const { inputPath, outputPath } = options;

    try {
      // Convert to Ogg Vorbis
      // Quality level 6 provides good balance between size and quality
      const command = `ffmpeg -i "${inputPath}" \
        -c:a libvorbis \
        -q:a 6 \
        -y "${outputPath}"`;

      await execAsync(command, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer

      const stats = await fs.stat(outputPath);

      return {
        success: true,
        outputPath,
        outputSize: stats.size,
      };
    } catch (error) {
      throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
}

export const conversionService = new ConversionService();

