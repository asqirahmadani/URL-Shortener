import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { CacheService } from '../../src/common/cache/cache.service';
import { Url } from '../../src/modules/url/entities/url.entity';
import { UrlService } from '../../src/modules/url/url.service';

describe('UrlService', () => {
  let service: UrlService;
  let repository: Repository<Url>;
  let cacheService: CacheService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    softDelete: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softRemove: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    manager: {
      transaction: jest.fn(),
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    urlLookupKey: jest.fn((code) => `url:lookup:${code}`),
    getTTL: jest.fn(() => 3600),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        SHORT_CODE_LENGTH: 6,
        BASE_URL: 'http://localhost:3000',
        ADMIN_PASS: 'aklnsfsokdgfnowqaeihnwierfhn',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlService,
        {
          provide: getRepositoryToken(Url),
          useValue: mockRepository,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    repository = module.get<Repository<Url>>(getRepositoryToken(Url));
    cacheService = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createShortUrl', () => {
    it('should create URL with random short code', async () => {
      const dto = { originalUrl: 'https://example.com' };
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        clickCount: 0,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUrl);
      mockRepository.save.mockResolvedValue(mockUrl);

      const result = await service.createShortUrl(dto);

      expect(result.shortCode).toBeDefined();
      expect(result.shortCode).toHaveLength(6);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create URL with custom alias', async () => {
      const dto = {
        originalUrl: 'https://example.com',
        customAlias: 'my-link',
      };
      const mockUrl = {
        id: 'uuid',
        shortCode: 'my-link',
        originalUrl: 'https://example.com',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUrl);
      mockRepository.save.mockResolvedValue(mockUrl);

      const result = await service.createShortUrl(dto);

      expect(result.shortCode).toBe('my-link');
    });

    it('should throw ConflictException for duplicate alias', async () => {
      const dto = {
        originalUrl: 'https://example.com',
        customAlias: 'existing',
      };

      mockRepository.findOne.mockResolvedValue({ shortCode: 'existing' });

      await expect(service.createShortUrl(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject localhost URLs', async () => {
      const dto = { originalUrl: 'http://localhost:3000' };

      await expect(service.createShortUrl(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should hash password if provided', async () => {
      const dto = {
        originalUrl: 'https://example.com',
        password: 'secret123',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({});
      mockRepository.save.mockResolvedValue({
        id: 'uuid',
        password: 'hashed',
      });

      const result = await service.createShortUrl(dto);

      expect(result.password).not.toBe('secret123');
    });
  });

  describe('getOriginal Url', () => {
    it('should return URL from cache if exists', async () => {
      const cachedUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: true,
        deletedAt: null,
        expiresAt: null,
        maxClicks: 0,
        clickCount: 0,
        password: null,
      };

      mockCacheService.get.mockResolvedValue(cachedUrl);

      const result = await service.getOriginalUrl('abc123');

      expect(result).toBe('https://example.com');
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should query DB and cache if not in cache', async () => {
      const dbUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: true,
        deletedAt: null,
        expiresAt: null,
        maxClicks: 0,
        clickCount: 0,
        password: null,
      };

      mockCacheService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(dbUrl);

      const result = await service.getOriginalUrl('abc123');

      expect(result).toBe('https://example.com');
      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent code', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getOriginalUrl('notfound')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error for expired URL', async () => {
      const expiredUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: true,
        deletedAt: null,
        expiresAt: new Date('2020-01-01'),
        password: null,
      };

      mockCacheService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(expiredUrl);

      await expect(service.getOriginalUrl('abc123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error for deleted URL', async () => {
      const deletedUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: true,
        deletedAt: new Date(),
        expiresAt: null,
        maxClicks: 0,
        clickCount: 0,
        password: null,
      };

      mockCacheService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(deletedUrl);

      await expect(service.getOriginalUrl('abc123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error for inactive URL', async () => {
      const inactiveUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: false,
        deletedAt: null,
        expiresAt: null,
        password: null,
      };

      mockCacheService.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(inactiveUrl);

      await expect(service.getOriginalUrl('abc123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateUrl', () => {
    it('should update URL and invalidate cache', async () => {
      const existingUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        title: 'Old Title',
      };
      const updateDto = { title: 'New Title' };

      mockRepository.findOne.mockResolvedValue(existingUrl);
      mockRepository.save.mockResolvedValue({
        ...existingUrl,
        title: 'New Title',
      });

      await service.updateUrl('uuid', updateDto);

      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockCacheService.del).toHaveBeenCalled();
    });
  });

  describe('deleteUrl', () => {
    it('should soft delete URL and invalidate cache', async () => {
      const url = {
        id: 'uuid',
        shortCode: 'abc123',
      };

      mockRepository.findOne.mockResolvedValue(url);
      mockRepository.softRemove.mockResolvedValue(url);

      await service.deleteUrl('uuid');

      expect(mockRepository.softRemove).toHaveBeenCalled();
      expect(mockCacheService.del).toHaveBeenCalled();
    });
  });

  describe('incrementClickCount', () => {
    it('should increment click count and invalidate cache', async () => {
      const url = { id: 'uuid', shortCode: 'abc123' };

      mockRepository.increment.mockResolvedValue({});
      mockRepository.findOne.mockResolvedValue(url);

      await service.incrementClickCount('uuid');

      expect(mockRepository.increment).toHaveBeenCalledWith(
        { id: 'uuid' },
        'clickCount',
        1,
      );
      expect(mockCacheService.del).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredUrls', () => {
    it('should delete expired URLs', async () => {
      const result = await service.cleanUpExpiredUrls();

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.softDelete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'expiresAt < :now',
        expect.any(Object),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'isActive = :isActive',
        { isActive: true },
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(result).toBe(1);
    });
  });

  describe('getAllUrls', () => {
    it('should return all URLs with correct password', async () => {
      const mockUrls = [
        { id: '1', shortCode: 'abc1', originalUrl: 'https://example1.com' },
        { id: '2', shortCode: 'abc2', originalUrl: 'https://example2.com' },
        { id: '3', shortCode: 'abc3', originalUrl: 'https://example3.com' },
      ];

      mockRepository.findAndCount.mockResolvedValue([mockUrls, 3]);

      const result = await service.getAllUrls(
        1,
        10,
        'aklnsfsokdgfnowqaeihnwierfhn',
      );

      expect(result.urls).toEqual(mockUrls);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 0,
      });
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      await expect(service.getAllUrls(1, 10, 'wrongpassword')).rejects.toThrow(
        'Need a correct password to access this!',
      );
    });

    it('should throw UnauthorizedException with null password', async () => {
      await expect(service.getAllUrls(1, 10, null as any)).rejects.toThrow(
        'Need a correct password to access this!',
      );
    });

    it('should handle pagination correctly', async () => {
      const mockUrls = [
        { id: '11', shortCode: 'abc11', originalUrl: 'https://example11.com' },
      ];

      mockRepository.findAndCount.mockResolvedValue([mockUrls, 21]);

      const result = await service.getAllUrls(
        3,
        10,
        'aklnsfsokdgfnowqaeihnwierfhn',
      );

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(3);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 20,
      });
    });
  });

  describe('getUserUrls', () => {
    it('should return user URLs with pagination', async () => {
      const mockUrls = [
        { id: '1', shortCode: 'abc1', userId: 'user-123' },
        { id: '2', shortCode: 'abc2', userId: 'user-123' },
      ];

      mockRepository.findAndCount.mockResolvedValue([mockUrls, 2]);

      const result = await service.getUserUrls('user-123', 1, 10);

      expect(result.urls).toEqual(mockUrls);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: { createdAt: 'DESC' },
        take: 10,
        skip: 0,
      });
    });

    it('should return empty array for user with no URLs', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getUserUrls('user-no-urls');

      expect(result.urls).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('getUrlByShortCode', () => {
    it('should return URL by short code with relations', async () => {
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        clicks: [],
      };

      mockRepository.findOne.mockResolvedValue(mockUrl);

      const result = await service.getUrlByShortCode('abc123');

      expect(result).toEqual(mockUrl);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { shortCode: 'abc123' },
        relations: ['clicks'],
      });
    });

    it('should throw NotFoundException if short code not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getUrlByShortCode('notfound')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUrlById', () => {
    it('should return URL by ID', async () => {
      const mockUrl = {
        id: 'uuid',
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
      };

      mockRepository.findOne.mockResolvedValue(mockUrl);

      const result = await service.getUrlById('uuid');

      expect(result).toEqual(mockUrl);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid' },
      });
    });

    it('should throw NotFoundException if ID not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getUrlById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExpiringUrls', () => {
    it('should return URLs expiring in next 7 days', async () => {
      const mockUrls = [
        { id: '1', shortCode: 'abc1', expiresAt: new Date() },
        { id: '2', shortCode: 'abc2', expiresAt: new Date() },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(mockUrls);

      const result = await service.getExpiringUrls(7);

      expect(result).toEqual(mockUrls);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('url');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'url.expiresAt IS NOT NULL',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'url.expiresAt <= :futureDate',
        expect.objectContaining({ futureDate: expect.any(Date) }),
      );
    });

    it('should use default 7 days if not specified', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.getExpiringUrls();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('bulkCreateShortUrls', () => {
    it('should create multiple URLs in transaction', async () => {
      const createDtos = [
        { originalUrl: 'https://example1.com' },
        { originalUrl: 'https://example2.com' },
        { originalUrl: 'https://example3.com' },
      ];

      const mockUrls = [
        { id: '1', shortCode: 'abc1', originalUrl: 'https://example1.com' },
        { id: '2', shortCode: 'abc2', originalUrl: 'https://example2.com' },
        { id: '3', shortCode: 'abc3', originalUrl: 'https://example3.com' },
      ];

      mockRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((entity, data) => data),
            save: jest.fn((data) => Promise.resolve({ id: 'uuid', ...data })),
          };
          return callback(mockManager);
        },
      );

      const result = await service.bulkCreateShortUrls(createDtos);

      expect(result).toHaveLength(3);
      expect(mockRepository.manager.transaction).toHaveBeenCalled();
    });

    it('should skip duplicate custom aliases', async () => {
      const createDtos = [
        { originalUrl: 'https://example1.com', customAlias: 'test1' },
        { originalUrl: 'https://example2.com', customAlias: 'duplicate' },
        { originalUrl: 'https://example3.com', customAlias: 'test3' },
      ];

      mockRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const mockManager = {
            findOne: jest.fn((entity, options) => {
              if (options.where.shortCode === 'duplicate') {
                return Promise.resolve({ shortCode: 'duplicate' });
              }
              return Promise.resolve(null);
            }),
            create: jest.fn((entity, data) => data),
            save: jest.fn((data) => Promise.resolve({ id: 'uuid', ...data })),
          };
          return callback(mockManager);
        },
      );

      const result = await service.bulkCreateShortUrls(createDtos);

      expect(result.length).toBeLessThan(3);
    });

    it('should skip URLs with past expiration', async () => {
      const pastDate = new Date('2020-01-01');
      const createDtos = [
        { originalUrl: 'https://example1.com' },
        {
          originalUrl: 'https://example2.com',
          expiresAt: pastDate.toISOString(),
        },
      ];

      mockRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((entity, data) => data),
            save: jest.fn((data) => Promise.resolve({ id: 'uuid', ...data })),
          };
          return callback(mockManager);
        },
      );

      const result = await service.bulkCreateShortUrls(createDtos);

      expect(result.length).toBeLessThan(2);
    });

    it('should hash passwords in bulk creation', async () => {
      const createDtos = [
        { originalUrl: 'https://example1.com', password: 'secret123' },
      ];

      mockRepository.manager.transaction.mockImplementation(
        async (callback) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((entity, data) => data),
            save: jest.fn((data) => Promise.resolve({ id: 'uuid', ...data })),
          };
          return callback(mockManager);
        },
      );

      const result = await service.bulkCreateShortUrls(createDtos);

      expect(result).toHaveLength(1);
    });
  });
});
