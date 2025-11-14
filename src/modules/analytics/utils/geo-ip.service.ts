import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import geoip from 'geoip-lite';

export interface GeoLocation {
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

/* 
GeoIP Service - Multi-source location lookup
1. geoip-lite
2. ip-api.com
3. Mock data (development)
*/
@Injectable()
export class GeoIpService {
  private readonly logger = new Logger(GeoIpService.name);
  private readonly isDevelopment: boolean;
  private readonly useApiLookup: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.isDevelopment = this.configService.get('NODE_ENV') !== 'production';
    this.useApiLookup =
      this.configService.get('GEOIP_USE_API', 'false') === 'true';
  }

  async getLocation(ipAddress: string): Promise<GeoLocation> {
    const normalizedIP = this.normalizeIP(ipAddress);

    this.logger.debug(
      `Original IP: ${ipAddress} → Normalized: ${normalizedIP}`,
    );

    // Development: Mock data for private IPs
    if (this.isDevelopment && this.isPrivateIP(normalizedIP)) {
      this.logger.debug(
        `Private IP detected: ${normalizedIP} - Using mock data`,
      );
      return this.getMockLocation(normalizedIP);
    }

    // Private IP in production
    if (this.isPrivateIP(normalizedIP)) {
      this.logger.debug(`Private IP in production: ${normalizedIP}`);
      return this.getNullLocation();
    }

    // Lookup real IP
    try {
      const geo = geoip.lookup(normalizedIP);

      if (!geo) {
        this.logger.debug(`GeoIP lookup failed for: ${normalizedIP}`);
        return this.getNullLocation();
      }

      return {
        country: geo.country || null,
        city: geo.city || null,
        latitude: geo.ll ? geo.ll[0] : null,
        longitude: geo.ll ? geo.ll[1] : null,
        timezone: geo.timezone || null,
      };
    } catch (error) {
      this.logger.error(`GeoIP error for ${normalizedIP}: ${error.message}`);
      return this.getNullLocation();
    }
  }

  /* 
  Local GeoIP lookup (geoip-lite)
  */
  private lookupLocal(ipAddress: string): GeoLocation {
    try {
      const geo = geoip.lookup(ipAddress);

      if (!geo) {
        return this.getNullLocation();
      }

      return {
        country: geo.country || null,
        city: geo.city || null,
        latitude: geo.ll ? geo.ll[0] : null,
        longitude: geo.ll ? geo.ll[1] : null,
        timezone: geo.timezone || null,
      };
    } catch (error) {
      this.logger.error(`Local GeoIP error for ${ipAddress}: ${error.message}`);
      return this.getNullLocation();
    }
  }

  /* 
  API GeoIP lookup
  */
  private async lookupApi(ipAddress: string): Promise<GeoLocation> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`http://ip-api.com/json/${ipAddress}`, {
          timeout: 3000,
        }),
      );

      const data = response.data;

      if (data.status === 'fail') {
        this.logger.debug(
          `API lookup failed for ${ipAddress}: ${data.message}`,
        );
        return this.getNullLocation();
      }

      return {
        country: data.countryCode || null,
        city: data.city || null,
        latitude: data.lat || null,
        longitude: data.lon || null,
        timezone: data.timezone || null,
      };
    } catch (error) {
      this.logger.error(`API GeoIP error for ${ipAddress}: ${error.message}`);
      return this.getNullLocation();
    }
  }

  private getMockLocation(ipAddress: string): GeoLocation {
    let hash = 0;

    if (ipAddress.includes(':')) {
      // IPv6: Use last segment
      const segments = ipAddress.split(':').filter((s) => s);
      const lastSegment = segments[segments.length - 1] || '0';
      hash = parseInt(lastSegment, 16) || 0;
    } else {
      // IPv4: Use last octet
      const octets = ipAddress.split('.');
      hash = parseInt(octets[octets.length - 1] || '0', 10);
    }

    const mockIndex = hash % this.mockLocations.length;
    const location = this.mockLocations[mockIndex];

    this.logger.debug(
      `Mock location for ${ipAddress}: ${location.city}, ${location.country}`,
    );

    return location;
  }

  private normalizeIP(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }

    if (ip.startsWith('::') && ip.includes('.')) {
      return ip.substring(2); // Remove '::' prefix
    }

    return ip;
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      // IPv4 localhost
      /^127\./,

      // IPv4 private ranges
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,

      // IPv6 localhost
      /^::1$/,
      /^0:0:0:0:0:0:0:1$/,

      // IPv6 private ranges
      /^fc00:/i, // Unique local address
      /^fd00:/i, // Unique local address
      /^fe80:/i, // Link-local address

      // IPv6 loopback variations
      /^0000:0000:0000:0000:0000:0000:0000:0001$/,
    ];

    return privateRanges.some((range) => range.test(ip));
  }

  private readonly mockLocations: GeoLocation[] = [
    {
      country: 'ID',
      city: 'Jakarta',
      latitude: -6.2088,
      longitude: 106.8456,
      timezone: 'Asia/Jakarta',
    },
    {
      country: 'ID',
      city: 'Surabaya',
      latitude: -7.2575,
      longitude: 112.7521,
      timezone: 'Asia/Jakarta',
    },
    {
      country: 'ID',
      city: 'Bandung',
      latitude: -6.9175,
      longitude: 107.6191,
      timezone: 'Asia/Jakarta',
    },
    {
      country: 'SG',
      city: 'Singapore',
      latitude: 1.3521,
      longitude: 103.8198,
      timezone: 'Asia/Singapore',
    },
    {
      country: 'US',
      city: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
    },
  ];

  private getNullLocation(): GeoLocation {
    return {
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
    };
  }
}
