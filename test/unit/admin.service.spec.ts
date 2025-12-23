import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Click } from '../../src/modules/analytics/entities/click.entity';
import { AdminService } from '../../src/modules/admin/admin.service';
import { Url } from '../../src/modules/url/entities/url.entity';

describe('AdminService', () => {
  let service: AdminService;
  let urlRepository: Repository<Url>;
  let clickRepository: Repository<Click>;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(5),
  };

  const mockUrlRepository = {
    count: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockClickRepository = {
    count: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(Url),
          useValue: mockUrlRepository,
        },
        {
          provide: getRepositoryToken(Click),
          useValue: mockClickRepository,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    urlRepository = module.get<Repository<Url>>(getRepositoryToken(Url));
    clickRepository = module.get<Repository<Click>>(getRepositoryToken(Click));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSystemStats', () => {
    it('should return system statistics', async () => {
      // mock URL counts
      mockUrlRepository.count
        .mockResolvedValueOnce(100) // total URLs
        .mockResolvedValueOnce(80); // active URLs

      // mock expired URLs count
      mockQueryBuilder.getCount.mockResolvedValue(20);

      // mock click counts
      mockClickRepository.count
        .mockResolvedValueOnce(500) // total clicks
        .mockResolvedValueOnce(50) // clicks today
        .mockResolvedValueOnce(20); // clicks this week

      mockUrlRepository.find.mockResolvedValue([
        { shortCode: 'abc123', clickCount: 100 },
        { shortCode: 'xyz789', clickCount: 75 },
        { shortCode: 'def456', clickCount: 50 },
      ]);

      const result = await service.getSystemStats();

      expect(result).toEqual({
        urls: {
          total: 100,
          active: 80,
          expired: 20,
        },
        clicks: {
          total: 500,
          today: 50,
          thisWeek: 200,
        },
        topUrls: [
          { shortCode: 'abc123', clicks: 100 },
          { shortCode: 'xyz789', clicks: 75 },
          { shortCode: 'def456', clicks: 50 },
        ],
      });

      // verify calls
      expect(mockUrlRepository.count).toHaveBeenCalledTimes(2);
      expect(mockUrlRepository.count).toHaveBeenNthCalledWith(1);
      expect(mockUrlRepository.count).toHaveBeenNthCalledWith(2, {
        where: { isActive: true },
      });
      expect(mockUrlRepository.createQueryBuilder).toHaveBeenCalledWith('url');
      expect(mockClickRepository.count).toHaveBeenCalledTimes(3);
      expect(mockUrlRepository.find).toHaveBeenCalledWith({
        order: { clickCount: 'DESC' },
        take: 10,
        select: ['shortCode', 'clickCount'],
      });
    });

    it('should handle zero URLs', async () => {
      mockUrlRepository.count.mockResolvedValue(0);
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockClickRepository.count.mockResolvedValue(0);
      mockUrlRepository.find.mockResolvedValue([]);

      const result = await service.getSystemStats();

      expect(result.urls.total).toBe(0);
      expect(result.urls.active).toBe(0);
      expect(result.urls.expired).toBe(0);
      expect(result.clicks.total).toBe(0);
      expect(result.topUrls).toHaveLength(0);
    });

    it('should correctly query expired URLs', async () => {
      mockUrlRepository.count.mockResolvedValue(0);
      mockClickRepository.count.mockResolvedValue(0);
      mockUrlRepository.find.mockResolvedValue([]);
      mockQueryBuilder.getCount.mockResolvedValue(10);

      await service.getSystemStats();

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'url.expiresAt < :now',
        { now: expect.any(Date) },
      );
    });

    it('should limit top URLs to 10', async () => {
      mockUrlRepository.count.mockResolvedValue(0);
      mockClickRepository.count.mockResolvedValue(0);
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const mockTopUrls = Array.from({ length: 15 }, (_, i) => ({
        shortCode: `url${i}`,
        clickCount: 100 - i,
      }));

      mockUrlRepository.find.mockResolvedValue(mockTopUrls);

      await service.getSystemStats();

      expect(mockUrlRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent URLs and clicks with default limit', async () => {
      const mockRecentUrls = [
        {
          id: '1',
          shortCode: 'abc123',
          originalUrl: 'https://example1.com',
          createdAt: new Date(),
        },
        {
          id: '2',
          shortCode: 'xyz789',
          originalUrl: 'https://example2.com',
          createdAt: new Date(),
        },
      ];

      const mockRecentClicks = [
        {
          id: '1',
          urlId: '1',
          createdAt: new Date(),
          url: mockRecentUrls[0],
        },
        {
          id: '2',
          urlId: '2',
          createdAt: new Date(),
          url: mockRecentUrls[1],
        },
      ];

      mockUrlRepository.find.mockResolvedValue(mockRecentUrls);
      mockClickRepository.find.mockResolvedValue(mockRecentClicks);

      const result = await service.getRecentActivity();

      expect(result.recentUrls).toEqual(mockRecentUrls);
      expect(result.recentClicks).toEqual(mockRecentClicks);

      expect(mockUrlRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 20,
      });

      expect(mockClickRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 20,
        relations: ['url'],
      });
    });

    it('should return recent activity with custom limit', async () => {
      mockUrlRepository.find.mockResolvedValue([]);
      mockClickRepository.find.mockResolvedValue([]);

      await service.getRecentActivity(50);

      expect(mockUrlRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 50,
      });

      expect(mockClickRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 50,
        relations: ['url'],
      });
    });

    it('should return empty arrays when no data exists', async () => {
      mockUrlRepository.find.mockResolvedValue([]);
      mockClickRepository.find.mockResolvedValue([]);

      const result = await service.getRecentActivity();

      expect(result.recentUrls).toHaveLength(0);
      expect(result.recentClicks).toHaveLength(0);
    });

    it('should include url relations in recent clicks', async () => {
      const mockUrlWithRelation = {
        id: '1',
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
      };

      const mockClickWithUrl = {
        id: '1',
        urlId: '1',
        createdAt: new Date(),
        url: mockUrlWithRelation,
      };

      mockUrlRepository.find.mockResolvedValue([mockUrlWithRelation]);
      mockClickRepository.find.mockResolvedValue([mockClickWithUrl]);

      const result = await service.getRecentActivity();

      expect(result.recentClicks[0].url).toBeDefined();
      expect(result.recentClicks[0].url.shortCode).toBe('abc123');
    });

    it('should order by createdAt DESC for both URLs and clicks', async () => {
      mockUrlRepository.find.mockResolvedValue([]);
      mockClickRepository.find.mockResolvedValue([]);

      await service.getRecentActivity(10);

      expect(mockUrlRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );

      expect(mockClickRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
