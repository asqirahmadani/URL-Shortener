import { Injectable, Logger } from '@nestjs/common';
import ogs from 'open-graph-scraper';

/* 
URL Preview Service - fetch open graph metadata from URLs
*/
@Injectable()
export class UrlPreviewService {
  private readonly logger = new Logger(UrlPreviewService.name);

  /* 
    Fetch open graph metadata
    */
  async fetchMetadata(url: string): Promise<{
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
  }> {
    try {
      const { result } = await ogs({ url, timeout: 5000 });

      return {
        title: result.ogTitle || result.twitterTitle || null,
        description: result.ogDescription || result.twitterDescription || null,
        image: result.ogImage?.[0].url || result.twitterImage?.[0].url || null,
        siteName: result.ogSiteName || null,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch metadata for ${url}: ${error.message}`,
      );
      return {
        title: null,
        description: null,
        image: null,
        siteName: null,
      };
    }
  }
}
