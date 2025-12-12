import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';

import { RateLimitService } from '../../src/modules/rate-limit/rate-limit.service';

describe('Rate Limiting (Integration)', () => {
  let rateLimitService: RateLimitService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        CacheModule.register({
          isGlobal: true,
          ttl: 60,
        }),
      ],
      providers: [RateLimitService],
    }).compile();

    rateLimitService = module.get<RateLimitService>(RateLimitService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Rate Limit Enforcement', () => {
    it('should allow requests within limit', async () => {
      const ip = `test-ip-${Date.now()}`;

      // First 10 requests should pass
      for (let i = 0; i < 10; i++) {
        const result = await rateLimitService.checkRateLimit(ip);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10 - i - 1);
      }
    });

    it('should block requests exceeding limit', async () => {
      const ip = `test-ip-${Date.now()}`;

      // Make 10 allowed requests
      for (let i = 0; i < 10; i++) {
        await rateLimitService.checkRateLimit(ip);
      }

      // 11th request should be blocked
      const result = await rateLimitService.checkRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset limit after TTL expires', async () => {
      const ip = `test-ip-${Date.now()}`;
      const customLimit = { ttl: 2, max: 5 }; // 2 seconds TTL

      // Use up all 5 requests
      for (let i = 0; i < 5; i++) {
        await rateLimitService.checkRateLimit(ip, customLimit);
      }

      // Should be blocked
      let result = await rateLimitService.checkRateLimit(ip, customLimit);
      expect(result.allowed).toBe(false);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Should be allowed again
      result = await rateLimitService.checkRateLimit(ip, customLimit);
      expect(result.allowed).toBe(true);
    });

    it('should handle different IPs independently', async () => {
      const ip1 = `test-ip-1-${Date.now()}`;
      const ip2 = `test-ip-2-${Date.now()}`;

      // Use up limit for IP1
      for (let i = 0; i < 10; i++) {
        await rateLimitService.checkRateLimit(ip1);
      }

      // IP1 should be blocked
      const result1 = await rateLimitService.checkRateLimit(ip1);
      expect(result1.allowed).toBe(false);

      // IP2 should still be allowed
      const result2 = await rateLimitService.checkRateLimit(ip2);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit for specific IP', async () => {
      const ip = `test-ip-${Date.now()}`;

      // Use up limit
      for (let i = 0; i < 10; i++) {
        await rateLimitService.checkRateLimit(ip);
      }

      // Should be blocked
      let result = await rateLimitService.checkRateLimit(ip);
      expect(result.allowed).toBe(false);

      // Reset limit
      await rateLimitService.resetRateLimit(ip);

      // Should be allowed again
      result = await rateLimitService.checkRateLimit(ip);
      expect(result.allowed).toBe(true);
    });
  });
});
