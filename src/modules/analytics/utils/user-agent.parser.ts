import { Injectable } from '@nestjs/common';
import { UAParser } from 'ua-parser-js';

/* 
User Agent Parser - Extract device info from user agent
*/
@Injectable()
export class UserAgentParser {
  parse(userAgent: string): {
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    osVersion: string | null;
    deviceType: string | null;
  } {
    if (!userAgent) {
      return {
        browser: null,
        browserVersion: null,
        os: null,
        osVersion: null,
        deviceType: null,
      };
    }

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser?.name || null,
      browserVersion: result.browser?.version || null,
      os: result.os?.name || null,
      osVersion: result.os?.version || null,
      deviceType: this.getDeviceType(result),
    };
  }

  private getDeviceType(result: UAParser.IResult): string | null {
    if (result.device.type === 'mobile') return 'mobile';
    if (result.device.type === 'tablet') return 'tablet';
    if (result.device.type === 'smarttv') return 'tv';
    if (result.device.type === 'wearable') return 'wearable';
    if (result.device.type === 'console') return 'console';

    const mobileOS = ['Android', 'iOS', 'Windows Phone', 'BlackBerry'];
    if (result.os.name && mobileOS.includes(result.os.name)) {
      return 'mobile';
    }

    // Check for bot/crawler
    const botKeywords = ['bot', 'crawler', 'spider', 'scraper'];
    const userAgent = result.ua.toLowerCase();
    if (botKeywords.some((keyword) => userAgent.includes(keyword))) {
      return 'bot';
    }

    // Default to desktop
    return 'desktop';
  }
}
