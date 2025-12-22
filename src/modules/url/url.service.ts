import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Repository, FindOptionsWhere } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { customAlphabet } from 'nanoid';
import * as bcrypt from 'bcrypt';

import { CacheService } from '../../common/cache/cache.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';
import { Url } from './entities/url.entity';

@Injectable()
export class UrlService {
  private readonly logger = new Logger(UrlService.name);
  private readonly shortCodeLength: number;
  private readonly baseUrl: string;
  private nanoid: (size?: number) => string;

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.shortCodeLength = this.configService.get<number>(
      'SHORT_CODE_LENGTH',
      6,
    );
    this.baseUrl = this.configService.get<string>(
      'BASE_URL',
      'http://localhost:3000',
    );
    this.nanoid = customAlphabet(
      'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      6,
    );
  }

  private async generateUniqueShortCode(): Promise<string> {
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const shortCode = this.nanoid();

      const existing = await this.urlRepository.findOne({
        where: { shortCode },
      });

      if (!existing) {
        this.logger.debug(`Generated unique short code: ${shortCode}`);
        return shortCode;
      }

      this.logger.warn(
        `Collision detected for ${shortCode}, attempt ${attempt}/${maxRetries}`,
      );
    }

    throw new Error('Failed to generate unique short code after max retries');
  }

  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // block localhost & private IPs
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (blockedHosts.includes(parsed.hostname)) {
        throw new BadRequestException(
          'Cannot shorten localhost or private IPs',
        );
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestException('Only HTTP(S) URLs are allowed');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid URL format');
    }
  }

  async createShortUrl(
    createUrlDto: CreateUrlDto,
    userId?: string,
  ): Promise<Url> {
    const { originalUrl, customAlias, password, expiresAt, maxClicks, title } =
      createUrlDto;

    this.validateUrl(originalUrl);
    let shortCode: string;

    if (customAlias) {
      const existing = await this.urlRepository.findOne({
        where: { shortCode: customAlias },
      });

      if (existing) {
        throw new ConflictException(
          `Custom alias ${customAlias} sudah digunakan`,
        );
      }

      shortCode = customAlias;
    } else {
      shortCode = await this.generateUniqueShortCode();
    }

    let hashedPassword: string | null = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    let expirationDate: Date | null = null;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);

      if (expirationDate < new Date()) {
        throw new BadRequestException(
          'Expiration date tidak boleh di masa lalu',
        );
      }
    }

    const url = this.urlRepository.create({
      originalUrl,
      shortCode,
      customAlias,
      title,
      userId: userId || null,
      password: hashedPassword,
      expiresAt: expirationDate,
      maxClicks: maxClicks || 0,
      isActive: true,
      clickCount: 0,
    });

    const savedUrl = await this.urlRepository.save(url);
    this.logger.log(
      `Created short URL: ${this.baseUrl}/${shortCode} -> ${originalUrl}`,
    );

    return savedUrl;
  }

  async getOriginalUrl(shortCode: string, password?: string): Promise<string> {
    const cacheKey = this.cacheService.urlLookupKey(shortCode);

    const cached = await this.cacheService.get<Url>(cacheKey);

    let url: Url;

    if (cached) {
      // Cache HIT
      url = cached;
      this.logger.debug(`Cache HIT for ${shortCode}`);
    } else {
      // Cache MISS
      const foundUrl = await this.urlRepository.findOne({
        where: { shortCode },
      });

      if (!foundUrl) {
        throw new NotFoundException(
          `Short URL "${shortCode}" tidak ditemukan!`,
        );
      }

      url = foundUrl;

      await this.cacheService.set(
        cacheKey,
        url,
        this.cacheService.getTTL('URL_LOOKUP'),
      );
      this.logger.debug(`Cache MISS for ${shortCode}, saved to cache`);
    }

    if (url.deletedAt) {
      throw new NotFoundException('URL telah dihapus!');
    }

    if (!url.isActive) {
      throw new BadRequestException('URL telah dinonaktifkan!');
    }

    if (url.expiresAt && new Date() > url.expiresAt) {
      throw new BadRequestException('URL telah expired!');
    }

    if (url.maxClicks && url.clickCount >= url.maxClicks) {
      throw new BadRequestException('URL telah mencapai batas maksimal klik!');
    }

    if (url.password) {
      if (!password) {
        throw new BadRequestException('URL ini dilindungi password!');
      }

      const isPasswordValid = await bcrypt.compare(password, url.password);
      if (!isPasswordValid) {
        throw new BadRequestException('Password salah!');
      }
    }

    this.logger.debug(`Redirection ${shortCode} to ${url.originalUrl}`);

    return url.originalUrl;
  }

  async getUrlByShortCode(shortCode: string): Promise<Url> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
      relations: ['clicks'],
    });

    if (!url) {
      throw new NotFoundException(`Short URL "${shortCode}" tidak ditemukan!`);
    }

    return url;
  }

  async getUrlById(id: string): Promise<Url> {
    const url = await this.urlRepository.findOne({
      where: { id },
    });

    if (!url) {
      throw new NotFoundException(`URL dengan ID "${id}" tidak ditemukan!`);
    }

    return url;
  }

  async getAllUrls(
    page: number = 1,
    limit: number = 10,
    password: string,
  ): Promise<{ urls: Url[]; total: number; page: number; totalPages: number }> {
    const adminPass = this.configService.get<string>(
      'ADMIN_PASS',
      'aklnsfsokdgfnowqaeihnwierfhn',
    );

    if (!password || password !== adminPass) {
      throw new UnauthorizedException(
        'Need a correct password to access this!',
      );
    }

    const skip = (page - 1) * limit;

    const [urls, total] = await this.urlRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      urls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserUrls(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ urls: Url[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    const [urls, total] = await this.urlRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      urls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUrl(id: string, updateUrlDto: UpdateUrlDto): Promise<Url> {
    const url = await this.getUrlById(id);

    if (updateUrlDto.title !== undefined) {
      url.title = updateUrlDto.title;
    }

    if (updateUrlDto.isActive !== undefined) {
      url.isActive = updateUrlDto.isActive;
    }

    if (updateUrlDto.expiresAt !== undefined) {
      if (updateUrlDto.expiresAt === null) {
        url.expiresAt = null;
      } else {
        const newExpiration = new Date(updateUrlDto.expiresAt);
        if (newExpiration < new Date()) {
          throw new BadRequestException(
            'Expiration date tidak boleh di masa lalu!',
          );
        }
        url.expiresAt = newExpiration;
      }
    }

    if (updateUrlDto.maxClicks !== undefined) {
      url.maxClicks = updateUrlDto.maxClicks;
    }

    const updatedUrl = await this.urlRepository.save(url);

    // Invalidate cache
    const cacheKey = this.cacheService.urlLookupKey(url.shortCode);
    await this.cacheService.del(cacheKey);

    this.logger.log(`Updated URL ${id} and invalidated cache`);

    return updatedUrl;
  }

  async deleteUrl(id: string): Promise<void> {
    const url = await this.getUrlById(id);

    await this.urlRepository.softRemove(url);

    // Invalidate cache
    const cacheKey = this.cacheService.urlLookupKey(url.shortCode);
    await this.cacheService.del(cacheKey);

    this.logger.log(`Soft deleted URL ${id} and invalidated cache`);
  }

  async incrementClickCount(urlId: string): Promise<void> {
    await this.urlRepository.increment({ id: urlId }, 'clickCount', 1);

    // Invalidate URL cache
    const url = await this.urlRepository.findOne({ where: { id: urlId } });
    if (url) {
      const cacheKey = this.cacheService.urlLookupKey(url.shortCode);
      await this.cacheService.del(cacheKey);
    }
  }

  async getExpiringUrls(daysAhead: number = 7): Promise<Url[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.urlRepository
      .createQueryBuilder('url')
      .where('url.expiresAt IS NOT NULL')
      .andWhere('url.expiresAt <= :futureDate', { futureDate })
      .andWhere('url.isActive = :isActive', { isActive: true })
      .getMany();
  }

  async cleanUpExpiredUrls(): Promise<number> {
    const result = await this.urlRepository
      .createQueryBuilder()
      .softDelete()
      .where('expiresAt < :now', { now: new Date() })
      .andWhere('isActive = :isActive', { isActive: true })
      .execute();

    const deletedCount = result.affected || 0;
    this.logger.log(`Cleaned up ${deletedCount} expired URLs`);

    return deletedCount;
  }

  /* 
  Bulk create short URLs
  */
  async bulkCreateShortUrls(
    createUrlDtos: CreateUrlDto[],
    userId?: string,
  ): Promise<Url[]> {
    const results: Url[] = [];

    // use transaction for ensure all or nothing
    await this.urlRepository.manager.transaction(async (manager) => {
      for (const dto of createUrlDtos) {
        const {
          originalUrl,
          customAlias,
          password,
          expiresAt,
          maxClicks,
          title,
        } = dto;

        // validate URL
        this.validateUrl(originalUrl);

        let shortCode: string;

        if (customAlias) {
          const existing = await manager.findOne(Url, {
            where: { shortCode: customAlias },
          });

          if (existing) {
            // skip duplicate
            this.logger.warn(`Skipping duplicate alias: ${customAlias}`);
            continue;
          }

          shortCode = customAlias;
        } else {
          shortCode = await this.generateUniqueShortCode();
        }

        let hashedPassword: string | null = null;
        if (password) {
          hashedPassword = await bcrypt.hash(password, 10);
        }

        let expirationDate: Date | null = null;
        if (expiresAt) {
          expirationDate = new Date(expiresAt);
          if (expirationDate < new Date()) {
            this.logger.warn(
              `Skipping URL with past expiration: ${originalUrl}`,
            );
            continue;
          }
        }

        const url = manager.create(Url, {
          originalUrl,
          shortCode,
          customAlias,
          title,
          userId: userId || null,
          password: hashedPassword,
          expiresAt: expirationDate,
          maxClicks: maxClicks || 0,
          isActive: true,
          clickCount: 0,
        });

        const savedUrl = await manager.save(url);
        results.push(savedUrl);
      }
    });

    this.logger.log(`Bulk created ${results.length} URLs`);
    return results;
  }
}
