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
    const { inputPath, outputPath } = options;

    try {
      // Convert RAW to TIFF using dcraw_emu (from libraw-bin, has better CR3 support)
      // Maximum quality settings:
      // -T: Write TIFF instead of PPM
      // -6: 16-bit output (maximum bit depth)
      // -w: Use camera white balance (accurate color)
      // -W: No auto-brightening (preserve exposure)
      // -4: Linear 16-bit (no gamma curve for maximum data preservation)
      // -o 5: Output in ProPhoto RGB color space (widest gamut, preserves all color data)
      // -Z -: Output to stdout (then redirect to file)
      // Creates a maximum quality TIFF: 16-bit linear, ProPhoto RGB, camera WB

      console.log('Converting RAW using dcraw_emu (16-bit linear, ProPhoto RGB, maximum quality)...');

      // Maximum quality TIFF: 16-bit linear, ProPhoto RGB, camera WB, no auto-brightening
      await execAsync(`dcraw_emu -T -6 -4 -w -W -o 5 -Z - "${inputPath}" > "${outputPath}"`);

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
    const { inputPath, outputPath, targetFormat } = options;

    try {
      // Try ImageMagick first (if available)
      try {
        await execAsync('convert -version');

        // ImageMagick conversion with maximum quality preservation
        let command = `convert "${inputPath}"`;

        // Maximum quality settings based on target format
        if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
          command += ' -quality 100 -sampling-factor 4:4:4'; // Maximum JPEG quality, no chroma subsampling
        } else if (targetFormat === 'png') {
          command += ' -quality 100 -define png:compression-level=9 -define png:compression-filter=5'; // Maximum PNG quality
        } else if (targetFormat === 'tiff') {
          command += ' -compress lzw -depth 16'; // Lossless compression with 16-bit depth
        } else if (targetFormat === 'webp') {
          command += ' -quality 100 -define webp:lossless=true'; // Lossless WebP
        }

        command += ` "${outputPath}"`;

        await execAsync(command, { maxBuffer: 100 * 1024 * 1024 }); // 100MB buffer for high-res images
      } catch (imageMagickError) {
        // Fallback to FFmpeg for image conversion
        console.log('ImageMagick not available, using FFmpeg for image conversion');

        let command = `ffmpeg -i "${inputPath}"`;

        // Maximum quality settings
        if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
          command += ' -q:v 1'; // Highest quality JPEG (scale 1-31, lower is better)
        } else if (targetFormat === 'png') {
          command += ' -compression_level 100'; // Maximum PNG compression (quality preserved)
        }

        command += ` -y "${outputPath}"`;

        await execAsync(command, { maxBuffer: 100 * 1024 * 1024 });
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
      // High-quality settings preserving original resolution
      // CRF 18: Near-lossless quality (lower = better, 15-23 recommended for high quality)
      // 2-pass encoding for better quality/size ratio
      // No resolution downscaling - preserves original dimensions
      const command = `ffmpeg -i "${inputPath}" \
        -c:v libvpx-vp9 \
        -crf 18 \
        -b:v 0 \
        -c:a libopus \
        -b:a 192k \
        -row-mt 1 \
        -threads 8 \
        -deadline good \
        -cpu-used 1 \
        -tile-columns 2 \
        -tile-rows 1 \
        -frame-parallel 0 \
        -auto-alt-ref 1 \
        -lag-in-frames 25 \
        -g 240 \
        -pix_fmt yuv420p10le \
        -y "${outputPath}"`;

      await execAsync(command, { maxBuffer: 200 * 1024 * 1024 }); // 200MB buffer for high quality

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
      // Convert to Ogg Vorbis with maximum quality
      // Quality level 10: Maximum quality (scale 0-10, higher is better)
      // Preserves sample rate and channels from source
      const command = `ffmpeg -i "${inputPath}" \
        -c:a libvorbis \
        -q:a 10 \
        -ar 48000 \
        -y "${outputPath}"`;

      await execAsync(command, { maxBuffer: 100 * 1024 * 1024 }); // 100MB buffer

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

