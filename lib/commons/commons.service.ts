import { CommonsMetadata, CommonsPublishResult } from '@/types/commons';

const COMMONS_API = process.env.COMMONS_API_ENDPOINT || 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = process.env.COMMONS_USER_AGENT || 'KOWiz/1.0 (https://kowiz.app)';

const CHUNK_THRESHOLD_BYTES = 90 * 1024 * 1024; // 90 MiB - switch to chunked uploads above this
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MiB chunks

export class CommonsService {
  /**
   * Upload a file buffer to Wikimedia Commons
   * Automatically handles chunked uploads for files > 90 MiB
   */
  async uploadBufferToCommons(
    fileBuffer: Buffer,
    metadata: CommonsMetadata,
    accessToken: string,
    preferredFilename: string
  ): Promise<CommonsPublishResult> {
    const filename = metadata.filename || preferredFilename;

    // Pre-check title blacklist to provide early feedback
    const titleCheck = await this.checkTitleBlacklist(filename, accessToken);
    if (!titleCheck.ok) {
      return {
        fileId: '',
        success: false,
        error: titleCheck.message || 'Filename is blocked by Commons title blacklist. Please use a more descriptive filename.',
      };
    }

    // Get CSRF token for this session
    const csrfToken = await this.getCsrfToken(accessToken);
    if (!csrfToken) {
      return { fileId: '', success: false, error: 'Failed to get CSRF token from Commons' };
    }

    // Build wikitext for the file description page
    const text = this.buildWikitext(metadata);
    const comment = metadata.description || 'Uploaded via KOWiz';

    // Choose upload method based on file size
    const useChunked = fileBuffer.length >= CHUNK_THRESHOLD_BYTES;

    const result = useChunked
      ? await this.uploadChunked({ fileBuffer, accessToken, csrfToken, filename, text, comment })
      : await this.uploadDirect({ fileBuffer, accessToken, csrfToken, filename, text, comment });

    return result;
  }

  /**
   * Direct upload for files < 90 MiB
   */
  private async uploadDirect({
    fileBuffer,
    accessToken,
    csrfToken,
    filename,
    text,
    comment,
  }: {
    fileBuffer: Buffer;
    accessToken: string;
    csrfToken: string;
    filename: string;
    text: string;
    comment: string;
  }): Promise<CommonsPublishResult> {
    const formData = new FormData();
    formData.set('action', 'upload');
    formData.set('format', 'json');
    formData.set('filename', filename);
    formData.set('token', csrfToken);
    formData.set('comment', comment);
    formData.set('text', text);
    formData.set('ignorewarnings', '1');
    formData.set('file', new Blob([new Uint8Array(fileBuffer)]), filename);

    const response = await fetch(COMMONS_API, {
      method: 'POST',
      headers: this.buildHeaders(accessToken),
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || data?.error) {
      const errorMsg = data?.error?.info || data?.error?.code || 'Commons upload failed';
      return {
        fileId: '',
        success: false,
        error: errorMsg,
        warnings: data?.upload?.warnings,
      };
    }

    return {
      fileId: '',
      success: true,
      descriptionUrl: data?.upload?.imageinfo?.descriptionurl,
      warnings: data?.upload?.warnings,
    };
  }

  /**
   * Chunked upload for files >= 90 MiB (up to 5 GiB on Commons)
   */
  private async uploadChunked({
    fileBuffer,
    accessToken,
    csrfToken,
    filename,
    text,
    comment,
  }: {
    fileBuffer: Buffer;
    accessToken: string;
    csrfToken: string;
    filename: string;
    text: string;
    comment: string;
  }): Promise<CommonsPublishResult> {
    let offset = 0;
    let fileKey: string | undefined;

    // Upload chunks to stash
    while (offset < fileBuffer.length) {
      const chunk = fileBuffer.subarray(offset, offset + CHUNK_SIZE_BYTES);
      const formData = new FormData();
      formData.set('action', 'upload');
      formData.set('format', 'json');
      formData.set('token', csrfToken);
      formData.set('filename', filename);
      formData.set('filesize', fileBuffer.length.toString());
      formData.set('offset', offset.toString());
      formData.set('stash', '1');
      formData.set('ignorewarnings', '1');
      if (fileKey) {
        formData.set('filekey', fileKey);
      }
      formData.set('chunk', new Blob([new Uint8Array(chunk)]), filename);

      const res = await fetch(COMMONS_API, {
        method: 'POST',
        headers: this.buildHeaders(accessToken),
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || json?.error) {
        return {
          fileId: '',
          success: false,
          error: json?.error?.info || 'Commons chunk upload failed',
          warnings: json?.upload?.warnings,
        };
      }

      fileKey = json?.upload?.filekey || fileKey;
      offset += chunk.length;
    }

    if (!fileKey) {
      return { fileId: '', success: false, error: 'Commons chunk upload did not return filekey' };
    }

    // Finalize upload from stash
    const finalForm = new FormData();
    finalForm.set('action', 'upload');
    finalForm.set('format', 'json');
    finalForm.set('token', csrfToken);
    finalForm.set('filekey', fileKey);
    finalForm.set('filename', filename);
    finalForm.set('comment', comment);
    finalForm.set('text', text);
    finalForm.set('ignorewarnings', '1');

    const finalizeRes = await fetch(COMMONS_API, {
      method: 'POST',
      headers: this.buildHeaders(accessToken),
      body: finalForm,
    });

    const finalizeJson = await finalizeRes.json();
    if (!finalizeRes.ok || finalizeJson?.error) {
      const errorMsg = finalizeJson?.error?.info || finalizeJson?.error?.code || 'Commons finalize upload failed';
      return {
        fileId: '',
        success: false,
        error: errorMsg,
        warnings: finalizeJson?.upload?.warnings,
      };
    }

    return {
      fileId: '',
      success: true,
      descriptionUrl: finalizeJson?.upload?.imageinfo?.descriptionurl,
      warnings: finalizeJson?.upload?.warnings,
    };
  }

  /**
   * Get CSRF token required for upload
   */
  private async getCsrfToken(accessToken: string): Promise<string | null> {
    const res = await fetch(`${COMMONS_API}?action=query&meta=tokens&type=csrf&format=json`, {
      method: 'GET',
      headers: this.buildHeaders(accessToken),
      cache: 'no-store',
    });

    const data = await res.json();
    return data?.query?.tokens?.csrftoken || null;
  }

  /**
   * Build request headers with OAuth token and user-agent
   */
  private buildHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
    };
  }

  /**
   * Pre-check if filename will be blocked by Commons title blacklist
   * This provides early feedback before attempting upload
   */
  async checkTitleBlacklist(filename: string, accessToken: string): Promise<{ ok: boolean; message?: string }> {
    const title = filename.startsWith('File:') ? filename : `File:${filename}`;
    const url = `${COMMONS_API}?action=titleblacklist&tbtitle=${encodeURIComponent(title)}&tbnooverride=1&format=json`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(accessToken),
        cache: 'no-store',
      });

      if (!res.ok) return { ok: true }; // fallback allow if API unavailable

      const data = await res.json();
      const result = data?.titleblacklist?.result;

      if (result === 'blacklisted') {
        const msg = data?.titleblacklist?.message || data?.titleblacklist?.reason || data?.titleblacklist?.line;
        return {
          ok: false,
          message: msg || 'Filename rejected by Commons title blacklist. Please use a more descriptive filename (avoid patterns like IMG_1234.JPG).'
        };
      }

      return { ok: true };
    } catch (err) {
      console.error('Title blacklist check error:', err);
      // On network/API failure, don't block upload; let Commons respond during upload
      return { ok: true };
    }
  }

  /**
   * Build wikitext for Commons file description page
   */
  private buildWikitext(metadata: CommonsMetadata): string {
    const categoryText = (metadata.categories || [])
      .filter(Boolean)
      .map((category) => `[[Category:${category}]]`)
      .join('\n');

    return `
== {{int:filedesc}} ==
{{Information
|description = ${metadata.description}
|source      = ${metadata.source}
|author      = ${metadata.author}
|date        = ${metadata.date}
}}

== {{int:license-header}} ==
${metadata.license}

${categoryText}
    `.trim();
  }
}

export const commonsService = new CommonsService();
