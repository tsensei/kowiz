export type MediaCategory = 'image' | 'video' | 'audio' | 'raw';

export interface FormatInfo {
  category: MediaCategory;
  originalFormat: string;
  targetFormat: string | null;
  needsConversion: boolean;
  isSupported: boolean;
}

export interface AvailableFormats {
  category: MediaCategory;
  inputFormat: string;
  supportedOutputs: string[];
  recommendedOutput: string;
}

// Available export formats for each category
const EXPORT_FORMATS: Record<MediaCategory, string[]> = {
  image: ['jpeg', 'png', 'gif', 'svg', 'tiff', 'xcf'],
  video: ['webm'],
  audio: ['ogg', 'opus', 'flac', 'wav'],
  raw: ['jpeg', 'png', 'tiff'], // RAW can export to these
};

// Wikimedia Commons supported formats
const SUPPORTED_FORMATS: Record<MediaCategory, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'svg', 'gif', 'tif', 'tiff', 'xcf', 'pdf', 'djvu'],
  video: ['webm', 'ogv'],
  audio: ['ogg', 'oga', 'opus', 'wav', 'flac', 'midi', 'mid'],
  raw: [], // RAW formats need conversion
};

// Format conversion mapping
const CONVERSION_MAP: Record<string, { category: MediaCategory; target: string }> = {
  // Images - Convert to JPEG
  heic: { category: 'image', target: 'jpeg' },
  heif: { category: 'image', target: 'jpeg' },
  webp: { category: 'image', target: 'jpeg' },
  bmp: { category: 'image', target: 'jpeg' },
  tga: { category: 'image', target: 'jpeg' },

  // RAW formats - Convert to TIFF (preserve quality) or JPEG
  cr2: { category: 'raw', target: 'tiff' },
  nef: { category: 'raw', target: 'tiff' },
  arw: { category: 'raw', target: 'tiff' },
  dng: { category: 'raw', target: 'tiff' },
  rw2: { category: 'raw', target: 'tiff' },
  orf: { category: 'raw', target: 'tiff' },
  raf: { category: 'raw', target: 'tiff' },
  cr3: { category: 'raw', target: 'tiff' },

  // Videos - Convert to WebM (VP9 + Opus)
  mp4: { category: 'video', target: 'webm' },
  mov: { category: 'video', target: 'webm' },
  avi: { category: 'video', target: 'webm' },
  mkv: { category: 'video', target: 'webm' },
  hevc: { category: 'video', target: 'webm' },
  h264: { category: 'video', target: 'webm' },
  m4v: { category: 'video', target: 'webm' },
  flv: { category: 'video', target: 'webm' },
  wmv: { category: 'video', target: 'webm' },

  // Audio - Convert to Ogg Vorbis
  mp3: { category: 'audio', target: 'ogg' },
  aac: { category: 'audio', target: 'ogg' },
  m4a: { category: 'audio', target: 'ogg' },
  wma: { category: 'audio', target: 'ogg' },
};

// MIME type to category mapping
const MIME_CATEGORY_MAP: Record<string, MediaCategory> = {
  'image/': 'image',
  'video/': 'video',
  'audio/': 'audio',
};

export class FormatDetectionService {
  /**
   * Detect file format and determine if conversion is needed
   */
  detectFormat(fileName: string, mimeType: string): FormatInfo {
    const extension = this.getExtension(fileName);
    const category = this.detectCategory(extension, mimeType);

    // Check if format needs conversion
    const conversionInfo = CONVERSION_MAP[extension];

    if (conversionInfo) {
      return {
        category: conversionInfo.category,
        originalFormat: extension,
        targetFormat: conversionInfo.target,
        needsConversion: true,
        isSupported: false,
      };
    }

    // Check if format is directly supported
    const isSupported = this.isFormatSupported(extension, category);

    return {
      category,
      originalFormat: extension,
      targetFormat: isSupported ? null : this.getDefaultTarget(category),
      needsConversion: !isSupported,
      isSupported,
    };
  }

  /**
   * Get file extension from filename
   */
  private getExtension(fileName: string): string {
    const parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * Detect media category from extension and MIME type
   */
  private detectCategory(extension: string, mimeType: string): MediaCategory {
    // Check conversion map first
    const conversionInfo = CONVERSION_MAP[extension];
    if (conversionInfo) {
      return conversionInfo.category;
    }

    // Check by MIME type
    for (const [prefix, category] of Object.entries(MIME_CATEGORY_MAP)) {
      if (mimeType.startsWith(prefix)) {
        return category;
      }
    }

    // Check by extension in supported formats
    for (const [category, formats] of Object.entries(SUPPORTED_FORMATS)) {
      if (formats.includes(extension)) {
        return category as MediaCategory;
      }
    }

    // Default to image if unknown
    return 'image';
  }

  /**
   * Check if format is directly supported by Wikimedia Commons
   */
  private isFormatSupported(extension: string, category: MediaCategory): boolean {
    const supportedFormats = SUPPORTED_FORMATS[category] || [];
    return supportedFormats.includes(extension);
  }

  /**
   * Get default conversion target for a category
   */
  private getDefaultTarget(category: MediaCategory): string {
    const defaults: Record<MediaCategory, string> = {
      image: 'jpeg',
      video: 'webm',
      audio: 'ogg',
      raw: 'tiff',
    };
    return defaults[category];
  }

  /**
   * Get available export formats for a file
   */
  getAvailableExportFormats(fileName: string, mimeType: string): AvailableFormats {
    const extension = this.getExtension(fileName);
    const category = this.detectCategory(extension, mimeType);
    const supportedOutputs = EXPORT_FORMATS[category] || [];
    const recommendedOutput = this.getDefaultTarget(category);

    return {
      category,
      inputFormat: extension,
      supportedOutputs,
      recommendedOutput,
    };
  }

  /**
   * Detect format with optional user-specified target format
   */
  detectFormatWithTarget(
    fileName: string,
    mimeType: string,
    userTargetFormat?: string
  ): FormatInfo {
    const extension = this.getExtension(fileName);
    const category = this.detectCategory(extension, mimeType);

    // If user specified a target format, use it
    if (userTargetFormat && userTargetFormat !== 'auto') {
      const availableFormats = EXPORT_FORMATS[category] || [];

      // Validate user selection is supported for this category
      if (availableFormats.includes(userTargetFormat)) {
        // Check if conversion is needed
        const needsConversion = extension !== userTargetFormat;

        return {
          category,
          originalFormat: extension,
          targetFormat: userTargetFormat,
          needsConversion,
          isSupported: this.isFormatSupported(userTargetFormat, category),
        };
      }
    }

    // Fall back to default detection logic
    return this.detectFormat(fileName, mimeType);
  }

  /**
   * Get human-readable format name
   */
  getFormatName(format: string): string {
    const names: Record<string, string> = {
      jpeg: 'JPEG',
      jpg: 'JPEG',
      png: 'PNG',
      webm: 'WebM',
      ogg: 'Ogg Vorbis',
      opus: 'Opus',
      flac: 'FLAC',
      wav: 'WAV',
      tiff: 'TIFF',
      gif: 'GIF',
      svg: 'SVG',
      xcf: 'XCF (GIMP)',
      heic: 'HEIC',
      heif: 'HEIF',
      mp4: 'MP4',
      mov: 'QuickTime',
      mp3: 'MP3',
    };
    return names[format.toLowerCase()] || format.toUpperCase();
  }
}

export const formatDetectionService = new FormatDetectionService();

