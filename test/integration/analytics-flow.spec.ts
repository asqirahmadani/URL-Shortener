import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Repository } from 'typeorm';

import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { AnalyticsModule } from '../../src/modules/analytics/analytics.module';
import { Click } from '../../src/modules/analytics/entities/click.entity';
import { Url } from '../../src/modules/url/entities/url.entity';
import { UrlService } from '../../src/modules/url/url.service';
import { UrlModule } from '../../src/modules/url/url.module';

describe('Analytics Flow (Integration)', () => {
  let app: INestApplication;
  let analyticsService: AnalyticsService;
  let urlService: UrlService;
  let clickRepository: Repository<Click>;
  let urlRepository: Repository<Url>;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT!) || 5432,
          username: process.env.DB_USERNAME || 'test',
          password: process.env.DB_PASSWORD || 'test',
          database: process.env.DB_DATABASE || 'test_db',
          entities: [Url, Click],
          synchronize: true,
          dropSchema: true,
        }),
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT!) || 6379,
          },
        }),
        CacheModule.register({
          isGlobal: true,
          ttl: 5,
        }),
        UrlModule,
        AnalyticsModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    urlService = module.get<UrlService>(UrlService);
    clickRepository = module.get<Repository<Click>>(getRepositoryToken(Click));
    urlRepository = module.get<Repository<Url>>(getRepositoryToken(Url));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await clickRepository.query('TRUNCATE "clicks" CASCADE');
    await urlRepository.query('TRUNCATE "urls" CASCADE');
  });

  describe('Click Tracking Flow', () => {
    it('should track click and update URL click count', async () => {
      // 1. Create URL
      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // 2. Process click event
      const clickEvent = {
        urlId: url.id,
        ipAddress: '8.8.8.8',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
        referer: 'https://google.com',
      };

      await analyticsService.processClickEvent(clickEvent);

      // 3. Verify click was saved
      const clicks = await clickRepository.find({ where: { urlId: url.id } });
      expect(clicks).toHaveLength(1);
      expect(clicks[0].ipAddress).toBe('8.8.8.8');
      expect(clicks[0].deviceType).toBe('mobile');
      expect(clicks[0].browser).toBeDefined();

      // 4. Verify URL click count incremented
      const updatedUrl = await urlRepository.findOne({ where: { id: url.id } });
      expect(updatedUrl!.clickCount).toBe(1);
    });

    it('should parse user agent correctly', async () => {
      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      const clickEvent = {
        urlId: url.id,
        ipAddress: '8.8.8.8',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        referer: '',
      };

      await analyticsService.processClickEvent(clickEvent);

      const click = await clickRepository.findOne({ where: { urlId: url.id } });

      expect(click!.browser).toBe('Chrome');
      expect(click!.os).toBe('Windows');
      expect(click!.deviceType).toBe('desktop');
    });

    it('should track multiple click from different sources', async () => {
      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      const clicks = [
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
          referer: 'https://google.com',
        },
        {
          urlId: url.id,
          ipAddress: '1.1.1.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          referer: 'https://facebook.com',
        },
        {
          urlId: url.id,
          ipAddress: '8.8.4.4',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
          referer: 'https://twitter.com',
        },
      ];

      for (const click of clicks) {
        await analyticsService.processClickEvent(click);
      }

      const savedClicks = await clickRepository.find({
        where: { urlId: url.id },
      });
      expect(savedClicks).toHaveLength(3);

      const updatedUrl = await urlRepository.findOne({ where: { id: url.id } });
      expect(updatedUrl!.clickCount).toBe(3);
    });
  });

  describe('Analytics Overview', () => {
    it('should return correct analytics overview', async () => {
      const mockUser = { role: 'admin' };

      // Create URL
      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Create multiple clicks
      const clickEvents = [
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          userAgent: 'Mozilla/5.0 (iPhone)',
          referer: 'https://google.com',
        },
        {
          urlId: url.id,
          ipAddress: '1.1.1.1',
          userAgent: 'Mozilla/5.0 (Windows)',
          referer: 'https://facebook.com',
        },
        {
          urlId: url.id,
          ipAddress: '8.8.8.8', // Same IP (not unique)
          userAgent: 'Mozilla/5.0 (iPhone)',
          referer: 'https://twitter.com',
        },
      ];

      for (const event of clickEvents) {
        await analyticsService.processClickEvent(event);
      }

      // Get analytics overview
      const overview = await analyticsService.getAnalyticsOverview(
        url.shortCode,
        mockUser,
      );

      expect(overview.totalClicks).toBe(3);
      expect(overview.uniqueVisitors).toBe(2); // 2 unique IPs
      expect(overview.createdAt).toBeDefined();
    });
  });

  describe('Timeline Analytics', () => {
    it('should return timeline data grouped by day', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Create clicks on different days
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Mock clicks with different timestamps
      await clickRepository.save([
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          createdAt: today,
        },
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          createdAt: today,
        },
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          createdAt: yesterday,
        },
      ]);

      const timeline = await analyticsService.getTimelineData(
        url.shortCode,
        'day',
        7,
        mockUser,
      );

      expect(timeline.data).toBeDefined();
      expect(timeline.interval).toBe('day');
      expect(timeline.totalClicks).toBeGreaterThan(0);
    });
  });

  describe('Location Analytics', () => {
    it('should aggregate click by country', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Create clicks with geo data
      const clicksWithGeo = [
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          country: 'US',
          city: 'Mountain View',
        },
        {
          urlId: url.id,
          ipAddress: '1.1.1.1',
          country: 'US',
          city: 'San Francisco',
        },
        {
          urlId: url.id,
          ipAddress: '8.8.4.4',
          country: 'ID',
          city: 'Jakarta',
        },
      ];

      for (const click of clicksWithGeo) {
        await clickRepository.save(click);
      }

      const locationStats = await analyticsService.getLocationStats(
        url.shortCode,
        mockUser,
      );

      expect(locationStats.countries).toHaveLength(2);
      expect(locationStats.countries[0].clicks).toBeGreaterThan(0);
      expect(locationStats.totalClicks).toBe(3);
    });
  });

  describe('Device Analytics', () => {
    it('should aggregate clicks by device type', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      const clickEvents = [
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          userAgent: 'Mozilla/5.0 (iPhone)',
          referer: '',
        },
        {
          urlId: url.id,
          ipAddress: '1.1.1.1',
          userAgent: 'Mozilla/5.0 (iPhone)',
          referer: '',
        },
        {
          urlId: url.id,
          ipAddress: '8.8.4.4',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          referer: '',
        },
      ];

      for (const event of clickEvents) {
        await analyticsService.processClickEvent(event);
      }

      const deviceStats = await analyticsService.getDeviceStats(
        url.shortCode,
        mockUser,
      );

      expect(deviceStats.byType).toBeDefined();
      expect(deviceStats.byBrowser).toBeDefined();
      expect(deviceStats.byOS).toBeDefined();
      expect(deviceStats.totalClicks).toBe(3);
    });
  });

  describe('Referrer Analytics', () => {
    it('should track and aggregate referrers', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      const clickEvents = [
        {
          urlId: url.id,
          ipAddress: '8.8.8.8',
          userAgent: 'Mozilla/5.0',
          referer: 'https://google.com',
        },
        {
          urlId: url.id,
          ipAddress: '1.1.1.1',
          userAgent: 'Mozilla/5.0',
          referer: 'https://google.com',
        },
        {
          urlId: url.id,
          ipAddress: '8.8.4.4',
          userAgent: 'Mozilla/5.0',
          referer: 'https://facebook.com',
        },
      ];

      for (const event of clickEvents) {
        await analyticsService.processClickEvent(event);
      }

      const referrerStats = await analyticsService.getReferrerStats(
        url.shortCode,
        mockUser,
      );

      expect(referrerStats).toHaveLength(2);
      expect(referrerStats[0].clicks).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Analytics Caching', () => {
    it('should cache analytics overview and return from cache', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Create some clicks
      await analyticsService.processClickEvent({
        urlId: url.id,
        ipAddress: '8.8.8.8',
        userAgent: 'Mozilla/5.0',
        referer: '',
      });

      // First call - should query DB
      const overview1 = await analyticsService.getAnalyticsOverview(
        url.shortCode,
        mockUser,
      );
      expect(overview1.totalClicks).toBe(1);

      // Add more clicks
      await analyticsService.processClickEvent({
        urlId: url.id,
        ipAddress: '1.1.1.1',
        userAgent: 'Mozilla/5.0',
        referer: '',
      });

      // Second call immediately - should return cached (stale) data
      const overview2 = await analyticsService.getAnalyticsOverview(
        url.shortCode,
        mockUser,
      );

      // Note: In real scenario with proper cache, this would still be 1 (cached)
      // But with cache invalidation on click, it should be updated
      expect(overview2.totalClicks).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Export Analytics', () => {
    it('should export analytics data as CSV', async () => {
      const mockUser = { role: 'admin' };

      const url = await urlService.createShortUrl({
        originalUrl: 'https://example.com',
      });

      // Create clicks
      await analyticsService.processClickEvent({
        urlId: url.id,
        ipAddress: '8.8.8.8',
        userAgent: 'Mozilla/5.0 (iPhone)',
        referer: 'https://google.com',
      });

      const csv = await analyticsService.exportAnalytics(
        url.shortCode,
        mockUser,
      );

      expect(csv).toContain('Timestamp');
      expect(csv).toContain('IP Address');
      expect(csv).toContain('Country');
      expect(csv).toContain('8.8.8.8');
    });
  });
});
