import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';

import { UserAgentParser } from './utils/user-agent.parser';
import { AnalyticsService } from './analytics.service';
import { GeoIpService } from './utils/geo-ip.service';
import { Url } from '../url/entities/url.entity';
import { Click } from './entities/click.entity';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let clickRepository: any;
  let urlRepository: any;
  let queue: any;

  const mockQueue = {
    add: jest.fn(),
  };

  const mockClickRepository = {
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUrlRepository = {
    findOne: jest.fn(),
    increment: jest.fn(),
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
        UserAgentParser,
        GeoIpService,
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    clickRepository = module.get(getRepositoryToken(Click));
    urlRepository = module.get(getRepositoryToken(Url));
    queue = module.get(getQueueToken('clicks'));
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
        expect.any(Object),
      );
    });
  });

  describe('processClickEvent', () => {
    it('should parse UA and save click', async () => {
      const clickEvent = {
        urlId: 'uuid',
        ipAddress: '8.8.8.8',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        referer: 'https://google.com',
      };

      mockClickRepository.create.mockReturnValue({
        ...clickEvent,
        browser: 'Mobile Safari',
        deviceType: 'mobile',
      });
      mockClickRepository.save.mockResolvedValue({ id: 'click-uuid' });
      mockUrlRepository.increment.mockResolvedValue({});

      await service.processClickEvent(clickEvent);

      expect(mockClickRepository.save).toHaveBeenCalled();
      expect(mockUrlRepository.increment).toHaveBeenCalledWith(
        { id: 'uuid' },
        'clickCount',
        1,
      );
    });
  });

  describe('getAnalyticsOverview', () => {
    it('should return analytics overview', async () => {
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        createdAt: new Date('2025-01-01'),
      };

      mockUrlRepository.findOne.mockResolvedValue(mockUrl);
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

      const result = await service.getAnalyticsOverview('abc123');

      expect(result.totalClicks).toBe(100);
      expect(result.uniqueVisitors).toBe(50);
    });
  });
});
