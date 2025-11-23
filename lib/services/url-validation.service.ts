export type UrlType = 'youtube' | 'direct' | 'unsupported';

export interface UrlValidationResult {
  isValid: boolean;
  type: UrlType;
  url: string;
  error?: string;
  metadata?: {
    platform?: string;
    videoId?: string;
  };
}

export class UrlValidationService {
  /**
   * Validate and categorize URL
   */
  validateUrl(url: string): UrlValidationResult {
    try {
      const parsedUrl = new URL(url);
      
      // Check if it's a YouTube URL
      if (this.isYouTubeUrl(parsedUrl)) {
        const videoId = this.extractYouTubeVideoId(parsedUrl);
        if (!videoId) {
          return {
            isValid: false,
            type: 'unsupported',
            url,
            error: 'Invalid YouTube URL - could not extract video ID',
          };
        }
        
        return {
          isValid: true,
          type: 'youtube',
          url,
          metadata: {
            platform: 'YouTube',
            videoId,
          },
        };
      }
      
      // Check if it's a direct media URL
      if (this.isDirectMediaUrl(parsedUrl)) {
        return {
          isValid: true,
          type: 'direct',
          url,
          metadata: {
            platform: 'Direct Link',
          },
        };
      }
      
      // Check if it's another supported platform
      const platform = this.detectPlatform(parsedUrl);
      if (platform) {
        return {
          isValid: true,
          type: 'youtube', // yt-dlp supports many platforms
          url,
          metadata: {
            platform,
          },
        };
      }
      
      return {
        isValid: false,
        type: 'unsupported',
        url,
        error: 'Unsupported URL - must be YouTube, Vimeo, or direct media link',
      };
    } catch (error) {
      return {
        isValid: false,
        type: 'unsupported',
        url,
        error: error instanceof Error ? error.message : 'Invalid URL format',
      };
    }
  }
  
  /**
   * Check if URL is YouTube
   */
  private isYouTubeUrl(url: URL): boolean {
    const youtubeHosts = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be',
      'www.youtu.be',
    ];
    
    return youtubeHosts.some(host => url.hostname === host);
  }
  
  /**
   * Extract YouTube video ID from URL
   */
  private extractYouTubeVideoId(url: URL): string | null {
    // youtu.be format
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.slice(1).split('?')[0];
    }
    
    // youtube.com format
    const videoId = url.searchParams.get('v');
    return videoId;
  }
  
  /**
   * Check if URL is a direct media link
   */
  private isDirectMediaUrl(url: URL): boolean {
    const mediaExtensions = [
      '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv',
      '.mp3', '.ogg', '.wav', '.m4a', '.aac',
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
    ];
    
    const pathname = url.pathname.toLowerCase();
    return mediaExtensions.some(ext => pathname.endsWith(ext));
  }
  
  /**
   * Detect platform from URL
   */
  private detectPlatform(url: URL): string | null {
    const platformMap: Record<string, string> = {
      // Top 5 major platforms
      'vimeo.com': 'Vimeo',
      'www.vimeo.com': 'Vimeo',
      'player.vimeo.com': 'Vimeo',
      'instagram.com': 'Instagram',
      'www.instagram.com': 'Instagram',
      'tiktok.com': 'TikTok',
      'www.tiktok.com': 'TikTok',
      'vm.tiktok.com': 'TikTok',
      'facebook.com': 'Facebook',
      'www.facebook.com': 'Facebook',
      'fb.watch': 'Facebook',
      'twitch.tv': 'Twitch',
      'www.twitch.tv': 'Twitch',
      'm.twitch.tv': 'Twitch',
      // Additional supported platforms
      'dailymotion.com': 'Dailymotion',
      'www.dailymotion.com': 'Dailymotion',
      'soundcloud.com': 'SoundCloud',
      'www.soundcloud.com': 'SoundCloud',
      'twitter.com': 'Twitter/X',
      'x.com': 'Twitter/X',
    };
    
    return platformMap[url.hostname] || null;
  }
  
  /**
   * Sanitize URL for storage
   */
  sanitizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      // Remove tracking parameters
      const cleanParams = new URLSearchParams();
      
      // Keep only essential parameters for YouTube
      if (this.isYouTubeUrl(parsedUrl)) {
        const v = parsedUrl.searchParams.get('v');
        if (v) cleanParams.set('v', v);
        const t = parsedUrl.searchParams.get('t');
        if (t) cleanParams.set('t', t);
      }
      
      const cleanUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.pathname}`;
      const params = cleanParams.toString();
      return params ? `${cleanUrl}?${params}` : cleanUrl;
    } catch {
      return url;
    }
  }
}

export const urlValidationService = new UrlValidationService();

