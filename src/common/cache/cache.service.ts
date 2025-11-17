import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { CacheMetricsService } from './cache-metrics.service';
import { InjectRepository } from '@nestjs/typeorm';

/* 
Cache Service - Wrapper around cache-manager with utilities
*/
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // Cache key prefixes
  private readonly PREFIXES = {
    URL: 'url:',
    ANALYTICS: 'analytics:',
    STATS: 'stats:',
  };

  //   TTL configuration
  private readonly TTL = {
    URL_LOOKUP: 3600 * 1000,
    ANALYTICS_OVERVIEW: 600 * 1000,
    ANALYTICS_TIMELINE: 300 * 1000,
    STATS: 900 * 1000,
  };

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly cacheMetrics: CacheMetricsService,
  ) {}

  /* 
  Get from cache
  */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cacheManager.get<T>(key);

      if (value) {
        this.cacheMetrics.recordHit();
        this.logger.debug(`Cache HIT: ${key}`);
      } else {
        this.cacheMetrics.recordMiss;
        this.logger.debug(`Cache MISS: ${key}`);
      }

      return value || null;
    } catch (error) {
      this.logger.error(`Cache GET error for ${key}: ${error.message}`);
      return null;
    }
  }

  /* 
  Set cache with TTL
  */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(
        `Cache SET: ${key} (TTL: ${ttl! / 1000 || 'default'}s)`,
      );
    } catch (error) {
      this.logger.error(`Cache SET error for ${key}: ${error.message}`);
    }
  }

  /* 
  Delete from cache
  */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DELETE: ${key}`);
    } catch (error) {
      this.logger.error(`Cache DELETE error for key ${key}: ${error.message}`);
    }
  }

  /* 
  Delete multiple keys by pattern
  */
  async delPattern(pattern: string): Promise<void> {
    try {
      this.logger.debug(`CACHE DELETE pattern: ${pattern}`);
      await this.cacheManager.clear(); // Temporary: clear all
      // TODO: Implement proper pattern deletion with redis SCAN
    } catch (error) {
      this.logger.error(`Cache DELETE pattern error: ${error.message}`);
    }
  }

  /* 
  Clear all cache
  */

  async reset(): Promise<void> {
    try {
      this.cacheMetrics.reset();
      await this.cacheManager.clear();
      this.logger.warn('Cache RESET: All cache cleared');
    } catch (error) {
      this.logger.error(`Cache RESET error: ${error.message}`);
    }
  }

  /* 
  Cache wrapper with fallback function (cache-aside / lazy loading)
  */
  async wrap<T>(
    key: string,
    fallback: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    try {
      let value = await this.get<T>(key);

      if (value === null) {
        this.logger.debug(`Cache MISS: ${key}, executing fallback`);
        value = await fallback();

        await this.set(key, value, ttl);
      }

      return value;
    } catch (error) {
      this.logger.error(`Cache WRAP error for ${key}: ${error.message}`);
      return fallback();
    }
  }

  /* 
  Generate cache key with prefix
  */
  getKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}${parts.join(':')}`;
  }

  /* 
  Helper methods for specific cache keys
  */

  //   URL cache keys
  urlLookupKey(shortCode: string): string {
    return this.getKey(this.PREFIXES.URL, 'lookup', shortCode);
  }

  //   Analytics cache keys
  analyticsOverviewKey(shortCode: string): string {
    return this.getKey(this.PREFIXES.ANALYTICS, 'overview', shortCode);
  }

  analyticsTimelineKey(
    shortCode: string,
    interval: string,
    days: number,
  ): string {
    return this.getKey(
      this.PREFIXES.ANALYTICS,
      'timeline',
      shortCode,
      interval,
      days,
    );
  }

  analyticsLocationsKey(shortCode: string): string {
    return this.getKey(this.PREFIXES.ANALYTICS, 'locations', shortCode);
  }

  analyticsDevicesKey(shortCode: string): string {
    return this.getKey(this.PREFIXES.ANALYTICS, 'devices', shortCode);
  }

  analyticsReferrersKey(shortCode: string): string {
    return this.getKey(this.PREFIXES.ANALYTICS, 'referrers', shortCode);
  }

  /* 
  GET TTL for type cache
  */
  getTTL(type: keyof typeof this.TTL): number {
    return this.TTL[type];
  }

  /* 
  Invalidate all analytics cache for specific URL
  */
  async invalidateAnalyticsCache(shortCode: string): Promise<void> {
    const keys = [
      this.analyticsOverviewKey(shortCode),
      this.analyticsLocationsKey(shortCode),
      this.analyticsDevicesKey(shortCode),
      this.analyticsReferrersKey(shortCode),
    ];

    await Promise.all(keys.map((key) => this.del(key)));

    this.logger.log(`Invalidated analytics cache for ${shortCode}`);
  }
}
