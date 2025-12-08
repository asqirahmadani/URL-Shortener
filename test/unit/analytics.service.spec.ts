import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Repository } from 'typeorm';

import { UserAgentParser } from '../../src/modules/analytics/utils/user-agent.parser';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { GeoIpService } from '../../src/modules/analytics/utils/geo-ip.service';
import { Click } from '../../src/modules/analytics/entities/click.entity';
import { CacheService } from '../../src/common/cache/cache.service';
import { Url } from '../../src/modules/url/entities/url.entity';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let clickRepository: Repository<Click>;
  let urlRepository: Repository<Url>;
  let queue: any;
  let cacheService: CacheService;

  const mockQueue = {
    add: jest.fn(),
  };

  const mockClickRepository = {
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUrlRepository = {
    findOne: jest.fn(),
    increment: jest.fn(),
  };

  const mockUserAgentParser = {
    parse: jest.fn(),
  };

  const mockGeoIpService = {
    getLocation: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    wrap: jest.fn(),
    analyticsOverviewKey: jest.fn((code) => `analytics:overview:${code}`),
    analyticsTimelineKey: jest.fn(
      (code, interval, days) =>
        `analytics:timeline:${code}:${interval}:${days}`,
    ),
    getTTL: jest.fn(() => 600),
    invalidateAnalyticsCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Click),
          useValue: mockClickRepository,
        },
        {
          provide: getRepositoryToken(Url),
          useValue: mockUrlRepository,
        },
        {
          provide: getQueueToken('clicks'),
          useValue: mockQueue,
        },
        {
          provide: UserAgentParser,
          useValue: mockUserAgentParser,
        },
        {
          provide: GeoIpService,
          useValue: mockGeoIpService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    clickRepository = module.get(getRepositoryToken(Click));
    urlRepository = module.get(getRepositoryToken(Url));
    queue = module.get(getQueueToken('clicks'));
    cacheService = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueClickEvent', () => {
    it('should add job to queue', async () => {
      const clickEvent = {
        urlId: 'uuid',
        ipAddress: '8.8.8.8',
        userAgent: 'Mozilla/5.0...',
        referer: 'https://google.com',
      };

      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      await service.enqueueClickEvent(clickEvent);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'record-click',
        clickEvent,
        expect.objectContaining({
          attempts: 3,
          backoff: expect.any(Object),
        }),
      );
    });
  });

  describe('processClickEvent', () => {
    it('should parse UA, get geo, and save click', async () => {
      const clickEvent = {
        urlId: 'uuid',
        ipAddress: '8.8.8.8',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)',
        referer: 'https://google.com',
      };

      mockUserAgentParser.parse.mockReturnValue({
        browser: 'Mobile Safari',
        browserVersion: '14.0',
        os: 'iOS',
        osVersion: '14.0',
        deviceType: 'mobile',
      });

      mockGeoIpService.getLocation.mockReturnValue({
        country: 'US',
        city: 'Mountain View',
        latitude: 37.386,
        longitude: -122.084,
        timezone: 'America/Los_Angeles',
      });

      mockClickRepository.create.mockReturnValue({
        id: 'click-uuid',
        ...clickEvent,
      });
      mockClickRepository.save.mockResolvedValue({ id: 'click-uuid' });
      mockUrlRepository.increment.mockResolvedValue({});

      await service.processClickEvent(clickEvent);

      expect(mockUserAgentParser.parse).toHaveBeenCalledWith(
        clickEvent.userAgent,
      );
      expect(mockGeoIpService.getLocation).toHaveBeenCalledWith(
        clickEvent.ipAddress,
      );
      expect(mockClickRepository.save).toHaveBeenCalled();
      expect(mockUrlRepository.increment).toHaveBeenCalledWith(
        { id: 'uuid' },
        'clickCount',
        1,
      );
    });

    it('should handle missing user agent gracefully', async () => {
      const clickEvent = {
        urlId: 'uuid',
        ipAddress: '8.8.8.8',
        userAgent: '',
        referer: '',
      };

      mockUserAgentParser.parse.mockReturnValue({
        browser: null,
        browserVersion: null,
        os: null,
        osVersion: null,
        deviceType: null,
      });

      mockGeoIpService.getLocation.mockReturnValue({
        country: null,
        city: null,
        latitude: null,
        longitude: null,
        timezone: null,
      });

      mockClickRepository.create.mockReturnValue({});
      mockClickRepository.save.mockResolvedValue({});
      mockUrlRepository.increment.mockResolvedValue({});

      await service.processClickEvent(clickEvent);

      expect(mockClickRepository.save).toHaveBeenCalled();
    });
  });

  describe('getAnalyticsOverview', () => {
    it('should return analytics overview', async () => {
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        createdAt: new Date('2025-01-01'),
      };

      const mockUser = {
        role: 'admin',
      };

      const mockOverview = {
        totalClicks: 100,
        uniqueVisitors: 50,
        topCountry: 'US',
        topDevice: 'mobile',
        topBrowser: 'Chrome',
        averageClicksPerDay: 10,
        lastClickAt: new Date(),
        createdAt: mockUrl.createdAt,
      };

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
      mockCacheService.wrap.mockImplementation(async (key, fallback) => {
        return fallback();
      });
      mockClickRepository.count.mockResolvedValue(100);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: '50' }),
      };

      mockClickRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockClickRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
      });

      const result = await service.getAnalyticsOverview('abc123', mockUser);

      expect(result.totalClicks).toBeDefined();
      expect(mockUrlRepository.findOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent URL', async () => {
      const mockUser = {
        role: 'admin',
      };

      mockUrlRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAnalyticsOverview('notfound', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTimelineData', () => {
    it('should return timeline data', async () => {
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
      };

      const mockUser = {
        role: 'admin',
      };

      const mockTimeline = {
        data: [
          { timestamp: '2025-01-01T00:00:00Z', clicks: 10 },
          { timestamp: '2025-01-02T00:00:00Z', clicks: 15 },
        ],
        interval: 'day',
        totalClicks: 25,
      };

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
      mockCacheService.wrap.mockImplementation(async (key, fallback) => {
        return fallback();
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { timestamp: '2025-01-01T00:00:00Z', clicks: '10' },
          { timestamp: '2025-01-02T00:00:00Z', clicks: '15' },
        ]),
      };

      mockClickRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTimelineData(
        'abc123',
        'day',
        7,
        mockUser,
      );

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('interval');
      expect(result).toHaveProperty('totalClicks');
    });
  });

  describe('getLocationStats', () => {
    it('should return location statistics', async () => {
      const mockUrl = { id: 'uuid', shortCode: 'abc123' };

      const mockUser = {
        role: 'admin',
      };

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
      mockCacheService.wrap.mockImplementation(async (key, fallback) => {
        return fallback();
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { countryCode: 'US', clicks: '50' },
          { countryCode: 'ID', clicks: '30' },
        ]),
      };

      mockClickRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getLocationStats('abc123', mockUser);

      expect(result).toHaveProperty('countries');
      expect(result).toHaveProperty('cities');
      expect(result.countries).toBeInstanceOf(Array);
    });
  });

  describe('getDeviceStats', () => {
    it('should return device statistics', async () => {
      const mockUrl = { id: 'uuid', shortCode: 'abc123' };

      const mockUser = {
        role: 'admin',
      };

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
      mockCacheService.wrap.mockImplementation(async (key, fallback) => {
        return fallback();
      });

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { deviceType: 'mobile', clicks: '60' },
          { deviceType: 'desktop', clicks: '40' },
        ]),
      };

      mockClickRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getDeviceStats('abc123', mockUser);

      expect(result).toHaveProperty('byType');
      expect(result).toHaveProperty('byBrowser');
      expect(result).toHaveProperty('byOS');
    });
  });

  describe('exportAnalytics', () => {
    it('should export analytics as CSV', async () => {
      const mockUrl = { id: 'uuid', shortCode: 'abc123' };
      const mockUser = { role: 'admin' };
      const mockClicks = [
        {
          createdAt: new Date(),
          ipAddress: '8.8.8.8',
          country: 'US',
          city: 'NYC',
          deviceType: 'mobile',
          browser: 'Chrome',
          os: 'iOS',
          referer: 'https://google.com',
        },
      ];

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
      mockClickRepository.find.mockResolvedValue(mockClicks);

      const result = await service.exportAnalytics('abc123', mockUser);

      expect(result).toContain('Timestamp');
      expect(result).toContain('IP Address');
      expect(result).toContain('Country');
    });
  });
});
