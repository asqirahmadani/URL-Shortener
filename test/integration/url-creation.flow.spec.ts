import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { RateLimitModule } from '../../src/modules/rate-limit/rate-limit.module';
import { Click } from '../../src/modules/analytics/entities/click.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { CacheService } from '../../src/common/cache/cache.service';
import { User } from '../../src/modules/auth/entities/user.entity';
import { CacheModule } from '../../src/common/cache/cache.module';
import { Url } from '../../src/modules/url/entities/url.entity';
import { UrlService } from '../../src/modules/url/url.service';
import { UrlModule } from '../../src/modules/url/url.module';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('URL Creation Flow (Integration)', () => {
  let app: INestApplication;
  let urlService: UrlService;
  let urlRepository: Repository<Url>;
  let cacheService: CacheService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5433),
            username: configService.get<string>('DB_USERNAME', 'test'),
            password: configService.get<string>('DB_PASSWORD', 'test'),
            database: configService.get<string>('DB_DATABASE', 'test_db'),
            entities: [Url, User, ApiKey, Click],
            synchronize: true,
            dropSchema: true,
            logging: false,
          }),
        }),
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              host: configService.get<string>('REDIS_HOST', 'localhost'),
              port: configService.get<number>('REDIS_PORT', 6380),
              password: configService.get<string>('REDIS_PASSWORD'),
              maxRetriesPerRequest: null,
              lazyConnect: true, // lazy connect for test
            },
          }),
        }),
        CacheModule,
        UrlModule,
        RateLimitModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    urlService = module.get<UrlService>(UrlService);
    urlRepository = module.get(getRepositoryToken(Url));
    cacheService = module.get<CacheService>(CacheService);
  }, 30000);

  afterAll(async () => {
    if (cacheService) {
      await cacheService.reset();
    }
    if (app) {
      await app.close();
    }
    if (module) {
      await module.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, 10000);

  beforeEach(async () => {
    // Clean database before each test
    try {
      await urlRepository.query('SELECT 1');
      await urlRepository.query('DELETE FROM "urls"');
      if (cacheService) {
        await cacheService.reset();
      }
    } catch (error) {
      console.error('Setup error:', error);
    }
  }, 10000);

  afterEach(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Complete URL Creation Flow', () => {
    it('should create URL, save to DB, and be retrievable', async () => {
      // 1. Create URL
      const createDto = {
        originalUrl: 'https://example.com',
        title: 'Test URL',
      };

      const createdUrl = await urlService.createShortUrl(createDto, 'user-123');

      // Verify created URL
      expect(createdUrl.id).toBeDefined();
      expect(createdUrl.shortCode).toBeDefined();
      expect(createdUrl.originalUrl).toBe('https://example.com');
      expect(createdUrl.userId).toBe('user-123');
      expect(createdUrl.clickCount).toBe(0);

      // 2. Verify URL exists in database
      const dbUrl = await urlRepository.findOne({
        where: { id: createdUrl.id },
      });

      expect(dbUrl).toBeDefined();
      expect(dbUrl!.shortCode).toBe(createdUrl.shortCode);

      // 3. Get original URL (should work from DB)
      const originalUrl = await urlService.getOriginalUrl(createdUrl.shortCode);
      expect(originalUrl).toBe('https://example.com');

      // 4. Verify cache was populated
      const cacheKey = cacheService.urlLookupKey(createdUrl.shortCode);
      const cachedUrl = await cacheService.get(cacheKey);
      expect(cachedUrl).toBeDefined();

      // 5. Second retrieval should come from cache
      const originalUrl2 = await urlService.getOriginalUrl(
        createdUrl.shortCode,
      );
      expect(originalUrl2).toBe('https://example.com');
    });

    it('should create URL with custom alias', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
        customAlias: 'my-custom-link',
      };

      const createdUrl = await urlService.createShortUrl(createDto);

      expect(createdUrl.shortCode).toBe('my-custom-link');

      // Verify in DB
      const dbUrl = await urlRepository.findOne({
        where: { shortCode: 'my-custom-link' },
      });

      expect(dbUrl).toBeDefined();
      expect(dbUrl!.customAlias).toBe('my-custom-link');
    });

    it('should prevent duplicate custom aliases', async () => {
      // Create first URL
      await urlService.createShortUrl({
        originalUrl: 'https://example.com',
        customAlias: 'duplicate',
      });

      // Try to create second URL with same alias
      await expect(
        urlService.createShortUrl({
          originalUrl: 'https://another.com',
          customAlias: 'duplicate',
        }),
      ).rejects.toThrow('sudah digunakan');

      // Verify only one URL exists
      const count = await urlRepository.count({
        where: { shortCode: 'duplicate' },
      });
      expect(count).toBe(1);
    });

    it('should create URL with expiration date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        originalUrl: 'https://example.com',
        expiresAt: futureDate.toISOString(),
      };

      const createdUrl = await urlService.createShortUrl(createDto);

      expect(createdUrl.expiresAt).toBeDefined();
      expect(new Date(createdUrl.expiresAt!).getTime()).toBeCloseTo(
        futureDate.getTime(),
        -3, // Within seconds
      );

      // Verify can still access (not expired yet)
      const originalUrl = await urlService.getOriginalUrl(createdUrl.shortCode);
      expect(originalUrl).toBe('https://example.com');
    });

    it('should create password-protected URL', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
        password: 'secret123',
      };

      const createdUrl = await urlService.createShortUrl(createDto);

      expect(createdUrl.password).toBeDefined();
      expect(createdUrl.password).not.toBe('secret123'); // Should be hashed

      // Should fail without password
      await expect(
        urlService.getOriginalUrl(createdUrl.shortCode),
      ).rejects.toThrow('dilindungi password');

      // Should succeed with correct password
      const originalUrl = await urlService.getOriginalUrl(
        createdUrl.shortCode,
        'secret123',
      );
      expect(originalUrl).toBe('https://example.com');

      // Should fail with wrong password
      await expect(
        urlService.getOriginalUrl(createdUrl.shortCode, 'wrongpass'),
      ).rejects.toThrow('Password salah');
    });

    it('should enforce max clicks limit', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
        maxClicks: 3,
      };

      const createdUrl = await urlService.createShortUrl(createDto);

      // Simulate 3 clicks
      for (let i = 0; i < 3; i++) {
        await urlService.incrementClickCount(createdUrl.id);
      }

      // Refresh from DB
      const updatedUrl = await urlRepository.findOne({
        where: { id: createdUrl.id },
      });

      expect(updatedUrl!.clickCount).toBe(3);

      // Should fail on 4th access
      await expect(
        urlService.getOriginalUrl(createdUrl.shortCode),
      ).rejects.toThrow('batas maksimal klik');
    });
  });

  describe('URL Update Flow', () => {
    it('should update URL and invalidate cache', async () => {
      // Create URL
      const createdUrl = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
        title: 'Original Title',
      });

      // Get URL (populates cache)
      await urlService.getOriginalUrl(createdUrl.shortCode);

      // Verify cache exists
      const cacheKey = cacheService.urlLookupKey(createdUrl.shortCode);
      let cachedUrl = await cacheService.get(cacheKey);
      expect(cachedUrl).toBeDefined();

      // Update URL
      const updatedUrl = await urlService.updateUrl(createdUrl.id, {
        title: 'Updated Title',
        isActive: false,
      });

      expect(updatedUrl.title).toBe('Updated Title');
      expect(updatedUrl.isActive).toBe(false);

      // Verify cache was invalidated
      cachedUrl = await cacheService.get(cacheKey);
      expect(cachedUrl).toBeNull();

      // Verify URL is now inactive
      await expect(
        urlService.getOriginalUrl(createdUrl.shortCode),
      ).rejects.toThrow('dinonaktifkan');
    });
  });

  describe('URL Delete Flow', () => {
    it('should soft delete URL and invalidate cache', async () => {
      // Create URL
      const createdUrl = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Get URL (populates cache)
      await urlService.getOriginalUrl(createdUrl.shortCode);

      // Delete URL
      await urlService.deleteUrl(createdUrl.id);

      // Verify soft delete
      const deletedUrl = await urlRepository.findOne({
        where: { id: createdUrl.id },
        withDeleted: true,
      });

      expect(deletedUrl).toBeDefined();
      expect(deletedUrl!.deletedAt).toBeDefined();

      // Verify cannot access deleted URL
      await expect(
        urlService.getOriginalUrl(createdUrl.shortCode),
      ).rejects.toThrow('tidak ditemukan');

      // Verify cache was invalidated
      const cacheKey = cacheService.urlLookupKey(createdUrl.shortCode);
      const cachedUrl = await cacheService.get(cacheKey);
      expect(cachedUrl).toBeNull();
    });
  });

  describe('Bulk URL Creation', () => {
    it('should create multiple URLs in transaction', async () => {
      const bulkDto = [
        { originalUrl: 'https://example.com/1' },
        { originalUrl: 'https://example.com/2' },
        { originalUrl: 'https://example.com/3' },
      ];

      const createdUrls = await urlService.bulkCreateShortUrls(bulkDto);

      expect(createdUrls).toHaveLength(3);
      expect(createdUrls[0].originalUrl).toBe('https://example.com/1');
      expect(createdUrls[1].originalUrl).toBe('https://example.com/2');
      expect(createdUrls[2].originalUrl).toBe('https://example.com/3');

      // Verify all in database
      const count = await urlRepository.count();
      expect(count).toBe(3);
    });

    it('should handle partial failures in bulk creation', async () => {
      // Create first URL
      await urlService.createShortUrl({
        originalUrl: 'https://example.com',
        customAlias: 'duplicate',
      });

      const bulkDto = [
        { originalUrl: 'https://example.com/1' },
        { originalUrl: 'https://example.com/2', customAlias: 'duplicate' }, // Duplicate
        { originalUrl: 'https://example.com/3' },
      ];

      const createdUrls = await urlService.bulkCreateShortUrls(bulkDto);

      // Should skip duplicate and create others
      expect(createdUrls.length).toBeLessThan(3);

      // Verify only valid URLs created
      const urls = await urlRepository.find();
      expect(urls.some((u) => u.originalUrl === 'https://example.com/1')).toBe(
        true,
      );
      expect(urls.some((u) => u.originalUrl === 'https://example.com/3')).toBe(
        true,
      );
    });
  });

  describe('URL Listing and Pagination', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 25; i++) {
        await urlService.createShortUrl(
          {
            originalUrl: `https://example.com/${i}`,
          },
          'user-123',
        );
      }
    });

    it('should return paginated user URLs', async () => {
      const page1 = await urlService.getUserUrls('user-123', 1, 10);

      expect(page1.urls).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(3);

      const page2 = await urlService.getUserUrls('user-123', 2, 10);

      expect(page2.urls).toHaveLength(10);
      expect(page2.page).toBe(2);

      // Verify different URLs on different pages
      expect(page1.urls[0].id).not.toBe(page2.urls[0].id);
    });

    it('should return empty for user with no URLs', async () => {
      const result = await urlService.getUserUrls('no-urls-user', 1, 10);

      expect(result.urls).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });
});
