import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Url } from './entities/url.entity';
import { UrlService } from './url.service';
import { Repository } from 'typeorm';

describe('UrlService', () => {
  let service: UrlService;
  let repository: Repository<Url>;

  // Mock repository
  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    increment: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  // Mock config service
  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        SHORT_CODE_LENGTH: 6,
        BASE_URL: 'http://localhost:3000',
      };
      return config[key] || defaultValue;
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
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    repository = module.get<Repository<Url>>(getRepositoryToken(Url));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createShortUrl', () => {
    it('should create short URL dengan random code', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...createDto,
        shortCode: 'abc123',
      });
      mockRepository.save.mockResolvedValue({
        id: 'uuid',
        ...createDto,
        shortCode: 'abc123',
      });

      const result = await service.createShortUrl(createDto);

      expect(result.shortCode).toBeDefined();
      expect(result.originalUrl).toBe(createDto.originalUrl);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create short URL dengan custom alias', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
        customAlias: 'my-link',
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        ...createDto,
        shortCode: 'my-link',
      });
      mockRepository.save.mockResolvedValue({
        id: 'uuid',
        ...createDto,
        shortCode: 'my-link',
      });

      const result = await service.createShortUrl(createDto);

      expect(result.shortCode).toBe('my-link');
    });

    it('should throw ConflictException jika alias sudah ada', async () => {
      const createDto = {
        originalUrl: 'https://example.com',
        customAlias: 'existing',
      };

      mockRepository.findOne.mockResolvedValue({ shortCode: 'existing' });

      await expect(service.createShortUrl(createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getOriginalUrl', () => {
    it('should return original URL if valid', async () => {
      const mockUrl = {
        shortCode: 'abc123',
        originalUrl: 'https://example.com',
        isActive: true,
        expiresAt: null,
        maxClicks: 0,
        clickCount: 0,
        password: null,
        deletedAt: null,
      };

      mockRepository.findOne.mockResolvedValue(mockUrl);

      const result = await service.getOriginalUrl('abc123');

      expect(result).toBe('https://example.com');
    });

    it('should throw NotFoundException jika short code tidak ada', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getOriginalUrl('notfound')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('incrementClickCount', () => {
    it('should increment click count', async () => {
      mockRepository.increment.mockResolvedValue({ affected: 1 });

      await service.incrementClickCount('uuid');

      expect(mockRepository.increment).toHaveBeenCalledWith(
        { id: 'uuid' },
        'clickCount',
        1,
      );
    });
  });
});
