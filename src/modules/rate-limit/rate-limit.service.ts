import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';

/* 
Rate Limit Service - Custom rate limiting with Redis
*/
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly ttl: number;
  private readonly maxRequests: number;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.ttl = this.configService.get<number>('RATE_LIMIT_TTL', 60);
    this.maxRequests = this.configService.get<number>('RATE_LIMIT_MAX', 10);
  }

  /* 
  Check if IP is rate limited
  */
  async checkRateLimit(
    ip: string,
    customLimit?: { ttl: number; max: number },
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    limit: number;
  }> {
    const limit = customLimit?.max || this.maxRequests;
    const ttl = customLimit?.ttl || this.ttl;
    const key = `ratelimit:${ip}`;

    try {
      const current = (await this.cacheManager.get<number>(key)) || 0;

      if (current >= limit) {
        // rate limited
        const ttlRemaining = await this.getTTL(key);
        const resetAt = new Date(Date.now() + ttlRemaining * 1000);

        this.logger.warn(`Rate limit exceeded for IP: ${ip}`);

        return {
          allowed: false,
          remaining: 0,
          resetAt,
          limit,
        };
      }

      // increment count
      const newCount = current + 1;
      await this.cacheManager.set(key, newCount, ttl);

      const ttlRemaining = await this.getTTL(key);
      const resetAt = new Date(Date.now() + ttlRemaining * 1000);

      return {
        allowed: true,
        remaining: limit - newCount,
        resetAt,
        limit,
      };
    } catch (error) {
      this.logger.error(`Rate limit check failed: ${error.message}`);
      return {
        allowed: true,
        remaining: limit,
        resetAt: new Date(Date.now() + ttl * 1000),
        limit,
      };
    }
  }

  /* 
  Reset rate limit for specific IP (admin)
  */
  async resetRateLimit(ip: string): Promise<void> {
    const key = `ratelimit:${ip}`;
    await this.cacheManager.del(key);
    this.logger.log(`Reset rate limit for IP: ${ip}`);
  }

  /* 
  Get TTL for cache key
  */
  private async getTTL(key: string): Promise<number> {
    return this.ttl;
  }

  /* 
  Check if IP is whitelisted
  */
  async isWhitelisted(ip: string): Promise<boolean> {
    // TODO: implement whitelist check form DB/config
    const whiltelistedIPs = this.configService
      .get<string>('WHITELISTED_IPS', '')
      .split(',')
      .filter(Boolean);

    return whiltelistedIPs.includes(ip);
  }

  /* 
  Check if IP is blacklisted
  */
  async isBlacklisted(ip: string): Promise<boolean> {
    // TODO: Implement blacklist check from DB/config
    const blacklistedIPs = this.configService
      .get<string>('BLACKLISTED_IPS', '')
      .split(',')
      .filter(Boolean);

    return blacklistedIPs.includes(ip);
  }
}
