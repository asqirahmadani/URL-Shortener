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

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softRemove: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(),
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
});
