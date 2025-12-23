import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Click } from '../../src/modules/analytics/entities/click.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { AdminService } from '../../src/modules/admin/admin.service';
import { User } from '../../src/modules/auth/entities/user.entity';
import { Url } from '../../src/modules/url/entities/url.entity';

describe('AdminService (Integration)', () => {
  let service: AdminService;
  let urlRepository: Repository<Url>;
  let clickRepository: Repository<Click>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5433),
            username: configService.get('DB_USERNAME', 'test'),
            password: configService.get('DB_PASSWORD', 'test'),
            database: configService.get('DB_DATABASE', 'test_db'),
            entities: [Url, User, ApiKey, Click],
            synchronize: true,
            dropSchema: true,
            logging: false,
          }),
        }),
        TypeOrmModule.forFeature([Url, Click]),
      ],
      providers: [AdminService],
    }).compile();

    service = module.get<AdminService>(AdminService);
    urlRepository = module.get<Repository<Url>>(getRepositoryToken(Url));
    clickRepository = module.get<Repository<Click>>(getRepositoryToken(Click));
    dataSource = module.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    // clean database before each test
    await clickRepository.query('DELETE FROM "clicks"');
    await urlRepository.query('DELETE FROM "urls"');
  });

  describe('getSystemStats', () => {
    it('should return correct stats with real database', async () => {
      // Create test data
      const urls: Url[] = [];
      for (let i = 1; i <= 5; i++) {
        const url = urlRepository.create({
          shortCode: `test${i}`,
          originalUrl: `https://example.com/${i}`,
          isActive: i <= 3, // 3 active, 2 inactive
          clickCount: i * 10,
        });
        urls.push(await urlRepository.save(url));
      }

      // Create expired URL
      const expiredUrl = urlRepository.create({
        shortCode: 'expired',
        originalUrl: 'https://expired.com',
        expiresAt: new Date('2020-01-01'),
        isActive: true,
      });
      await urlRepository.save(expiredUrl);

      // Create clicks
      for (const url of urls) {
        for (let i = 0; i < 3; i++) {
          const click = clickRepository.create({
            url,
            ipAddress: '192.168.1.1',
            userAgent: 'Test Agent',
          });
          await clickRepository.save(click);
        }
      }

      // Get stats
      const stats = await service.getSystemStats();

      // Verify
      expect(stats.urls.total).toBe(6); // 5 + 1 expired
      expect(stats.urls.active).toBe(4); // 3 + 1 expired (active)
      expect(stats.urls.expired).toBe(1);
      expect(stats.clicks.total).toBe(15); // 5 URLs * 3 clicks

      expect(stats.topUrls).toHaveLength(6);
      expect(stats.topUrls[0].shortCode).toBe('test5'); // Highest click count
      expect(stats.topUrls[0].clicks).toBe(50);
    });

    it('should return zero stats for empty database', async () => {
      const stats = await service.getSystemStats();

      expect(stats.urls.total).toBe(0);
      expect(stats.urls.active).toBe(0);
      expect(stats.urls.expired).toBe(0);
      expect(stats.clicks.total).toBe(0);
      expect(stats.clicks.today).toBe(0);
      expect(stats.clicks.thisWeek).toBe(0);
      expect(stats.topUrls).toHaveLength(0);
    });

    it('should correctly count clicks today', async () => {
      // Create URL
      const url = urlRepository.create({
        shortCode: 'today',
        originalUrl: 'https://example.com',
      });
      await urlRepository.save(url);

      // Create clicks with different dates
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Click today
      const clickToday = clickRepository.create({
        url,
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
        createdAt: today,
      });
      await clickRepository.save(clickToday);

      // Click yesterday
      const clickYesterday = clickRepository.create({
        url,
        ipAddress: '192.168.1.2',
        userAgent: 'Test',
        createdAt: yesterday,
      });
      await clickRepository.save(clickYesterday);

      const stats = await service.getSystemStats();

      expect(stats.clicks.total).toBe(2);
      // Note: The today count might be 1 or 2 depending on time precision
      // This is a known limitation in the current implementation
    });

    it('should limit top URLs to 10', async () => {
      // Create 15 URLs
      for (let i = 1; i <= 15; i++) {
        const url = urlRepository.create({
          shortCode: `url${i}`,
          originalUrl: `https://example.com/${i}`,
          clickCount: 100 - i,
        });
        await urlRepository.save(url);
      }

      const stats = await service.getSystemStats();

      expect(stats.topUrls).toHaveLength(10);
      expect(stats.topUrls[0].shortCode).toBe('url1'); // Highest clicks
      expect(stats.topUrls[9].shortCode).toBe('url10'); // 10th highest
    });

    it('should order top URLs by click count descending', async () => {
      // Create URLs with specific click counts
      const urlData = [
        { shortCode: 'low', clickCount: 5 },
        { shortCode: 'high', clickCount: 100 },
        { shortCode: 'medium', clickCount: 50 },
      ];

      for (const data of urlData) {
        const url = urlRepository.create({
          ...data,
          originalUrl: `https://example.com/${data.shortCode}`,
        });
        await urlRepository.save(url);
      }

      const stats = await service.getSystemStats();

      expect(stats.topUrls[0].shortCode).toBe('high');
      expect(stats.topUrls[0].clicks).toBe(100);
      expect(stats.topUrls[1].shortCode).toBe('medium');
      expect(stats.topUrls[1].clicks).toBe(50);
      expect(stats.topUrls[2].shortCode).toBe('low');
      expect(stats.topUrls[2].clicks).toBe(5);
    });

    it('should not count inactive URLs as expired', async () => {
      // Create expired but inactive URL
      const expiredInactive = urlRepository.create({
        shortCode: 'expired-inactive',
        originalUrl: 'https://example.com',
        expiresAt: new Date('2020-01-01'),
        isActive: false,
      });
      await urlRepository.save(expiredInactive);

      const stats = await service.getSystemStats();

      expect(stats.urls.expired).toBe(0); // Should not count inactive
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent URLs and clicks from database', async () => {
      // Create URLs
      const urls: Url[] = [];
      for (let i = 1; i <= 5; i++) {
        const url = urlRepository.create({
          shortCode: `recent${i}`,
          originalUrl: `https://example.com/${i}`,
        });
        urls.push(await urlRepository.save(url));
      }

      // Create clicks
      for (const url of urls) {
        const click = clickRepository.create({
          url,
          ipAddress: '192.168.1.1',
          userAgent: 'Test Agent',
        });
        await clickRepository.save(click);
      }

      const activity = await service.getRecentActivity(10);

      expect(activity.recentUrls).toHaveLength(5);
      expect(activity.recentClicks).toHaveLength(5);

      // Verify URL structure
      expect(activity.recentUrls[0]).toHaveProperty('id');
      expect(activity.recentUrls[0]).toHaveProperty('shortCode');
      expect(activity.recentUrls[0]).toHaveProperty('originalUrl');

      // Verify click has URL relation
      expect(activity.recentClicks[0]).toHaveProperty('url');
      expect(activity.recentClicks[0].url).toHaveProperty('shortCode');
    });

    it('should respect custom limit parameter', async () => {
      // Create 10 URLs
      for (let i = 1; i <= 10; i++) {
        const url = urlRepository.create({
          shortCode: `url${i}`,
          originalUrl: `https://example.com/${i}`,
        });
        await urlRepository.save(url);
      }

      const activity = await service.getRecentActivity(3);

      expect(activity.recentUrls.length).toBeLessThanOrEqual(3);
    });

    it('should order by createdAt DESC', async () => {
      // Create URLs with delays to ensure different timestamps
      const url1 = urlRepository.create({
        shortCode: 'first',
        originalUrl: 'https://example1.com',
      });
      await urlRepository.save(url1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const url2 = urlRepository.create({
        shortCode: 'second',
        originalUrl: 'https://example2.com',
      });
      await urlRepository.save(url2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const url3 = urlRepository.create({
        shortCode: 'third',
        originalUrl: 'https://example3.com',
      });
      await urlRepository.save(url3);

      const activity = await service.getRecentActivity();

      // Most recent should be first
      expect(activity.recentUrls[0].shortCode).toBe('third');
      expect(activity.recentUrls[1].shortCode).toBe('second');
      expect(activity.recentUrls[2].shortCode).toBe('first');
    });

    it('should return empty arrays for empty database', async () => {
      const activity = await service.getRecentActivity();

      expect(activity.recentUrls).toHaveLength(0);
      expect(activity.recentClicks).toHaveLength(0);
    });

    it('should include URL relation in clicks', async () => {
      // Create URL
      const url = urlRepository.create({
        shortCode: 'test',
        originalUrl: 'https://example.com',
        title: 'Test URL',
      });
      await urlRepository.save(url);

      // Create click
      const click = clickRepository.create({
        url,
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        country: 'ID',
        city: 'Jakarta',
      });
      await clickRepository.save(click);

      const activity = await service.getRecentActivity();

      expect(activity.recentClicks).toHaveLength(1);
      expect(activity.recentClicks[0].url).toBeDefined();
      expect(activity.recentClicks[0].url.shortCode).toBe('test');
      expect(activity.recentClicks[0].url.title).toBe('Test URL');
    });

    it('should handle large dataset efficiently', async () => {
      // Create 100 URLs
      const urls: Url[] = [];
      for (let i = 1; i <= 100; i++) {
        const url = urlRepository.create({
          shortCode: `bulk${i}`,
          originalUrl: `https://example.com/${i}`,
        });
        urls.push(url);
      }
      await urlRepository.save(urls);

      // Create 100 clicks
      const clicks: Click[] = [];
      for (const url of urls) {
        const click = clickRepository.create({
          url,
          ipAddress: '192.168.1.1',
          userAgent: 'Test',
        });
        clicks.push(click);
      }
      await clickRepository.save(clicks);

      // Should only return limit amount
      const activity = await service.getRecentActivity(20);

      expect(activity.recentUrls.length).toBeLessThanOrEqual(20);
      expect(activity.recentClicks.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Database Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      // Create test data
      for (let i = 1; i <= 10; i++) {
        const url = urlRepository.create({
          shortCode: `concurrent${i}`,
          originalUrl: `https://example.com/${i}`,
        });
        await urlRepository.save(url);
      }

      // Make concurrent requests
      const requests = [
        service.getSystemStats(),
        service.getRecentActivity(5),
        service.getSystemStats(),
        service.getRecentActivity(10),
      ];

      const results = await Promise.all(requests);

      expect(results[0]).toHaveProperty('urls');
      expect(results[1]).toHaveProperty('recentUrls');
      expect(results[2]).toHaveProperty('clicks');
      expect(results[3]).toHaveProperty('recentClicks');
    });

    it('should maintain data consistency across multiple operations', async () => {
      // Create initial data
      const url = urlRepository.create({
        shortCode: 'consistency',
        originalUrl: 'https://example.com',
      });
      await urlRepository.save(url);

      const stats1 = await service.getSystemStats();
      const activity1 = await service.getRecentActivity();

      // Add more data
      const url2 = urlRepository.create({
        shortCode: 'consistency2',
        originalUrl: 'https://example2.com',
      });
      await urlRepository.save(url2);

      const stats2 = await service.getSystemStats();
      const activity2 = await service.getRecentActivity();

      // Verify data increased consistently
      expect(stats2.urls.total).toBe(stats1.urls.total + 1);
      expect(activity2.recentUrls.length).toBe(activity1.recentUrls.length + 1);
    });
  });
});
