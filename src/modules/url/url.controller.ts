import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';

import { RateLimit } from '../rate-limit/decorators/rate-limit.decorator';
import { PaginatedResponseDto } from './dto/paginated-url-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimitGuard } from '../rate-limit/guards/rate-limit.guard';
import { AnalyticsService } from '../analytics/analytics.service';
import { ClickEventDto } from '../analytics/dto/click-event.dto';
import { BulkCreateUrlDto } from './dto/bulk-create-url.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UrlPreviewService } from './url-preview.service';
import { UrlResponseDto } from './dto/url-response.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/entities/user.entity';
import { CreateUrlDto } from './dto/create-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';
import { UrlService } from './url.service';

/*
 URL Controller - RESTful endpoints for URL Shortening
 */
@Controller()
@UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
export class UrlController {
  private readonly logger = new Logger(UrlController.name);

  constructor(
    private readonly urlService: UrlService,
    private readonly analyticsService: AnalyticsService,
    private readonly urlPreviewService: UrlPreviewService,
  ) {}

  /* 
  Create short URL (strict rate limit)
  */
  @Post('/api/urls')
  @RateLimit({ ttl: 60, max: 5 })
  @HttpCode(HttpStatus.CREATED)
  async createdShortUrl(
    @Body() createUrlDto: CreateUrlDto,
    @CurrentUser() user: any,
  ): Promise<UrlResponseDto> {
    const url = await this.urlService.createShortUrl(createUrlDto, user.id);
    this.logger.log(`Created short URL: ${url.shortCode}`);

    return plainToInstance(UrlResponseDto, url, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  Bulk create short URLs
  */
  @Post('api/urls/bulk')
  @RateLimit({ ttl: 300, max: 5 }) // max 5 bulk operations per 5 minutes
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateShortUrls(
    @Body() bulkcreateDto: BulkCreateUrlDto,
    @CurrentUser() user: any,
  ): Promise<{ urls: UrlResponseDto[]; created: number; skipped: number }> {
    const urls = await this.urlService.bulkCreateShortUrls(
      bulkcreateDto.urls,
      user.id,
    );

    const urlDtos = urls.map((url) =>
      plainToInstance(UrlResponseDto, url, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      urls: urlDtos,
      created: urls.length,
      skipped: bulkcreateDto.urls.length - urls.length,
    };
  }

  /* 
  Get URL preview/metadata
  */
  @Post('api/urls/preview')
  @RateLimit({ ttl: 60, max: 10 })
  async getUrlPreview(@Body('url') url: string): Promise<{
    url: string;
    metadata: {
      title: string | null;
      description: string | null;
      image: string | null;
      siteName: string | null;
    };
  }> {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    const metadata = await this.urlPreviewService.fetchMetadata(url);

    return {
      url,
      metadata,
    };
  }

  /* 
  Get URL details by ID
  */
  @Get('api/urls/:id')
  async getUrlById(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<UrlResponseDto> {
    const url = await this.urlService.getUrlById(id);

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get URL');
    }

    return plainToInstance(UrlResponseDto, url, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  List all URLs with pagination
  */
  @Get('api/urls-admin')
  async getAllUrls(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('password') password: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ): Promise<PaginatedResponseDto> {
    if (user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get list all URLs');
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const result = await this.urlService.getAllUrls(
      pageNum,
      limitNum,
      password,
    );

    const urls = result.urls.map((url) =>
      plainToInstance(UrlResponseDto, url, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      urls,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      limit: limitNum,
    };
  }

  /* 
  List user's URLs with pagination
  */
  @Get('api/urls')
  async getUserUrls(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @CurrentUser() user: any,
  ): Promise<PaginatedResponseDto> {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const result = await this.urlService.getUserUrls(
      user.id,
      pageNum,
      limitNum,
    );

    const urls = result.urls.map((url) =>
      plainToInstance(UrlResponseDto, url, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      urls,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      limit: limitNum,
    };
  }

  /* 
  Update URL
  */
  @Put('api/urls/:id')
  async updateURL(
    @Param('id') id: string,
    @Body() updateUrlDto: UpdateUrlDto,
    @CurrentUser() user: any,
  ): Promise<UrlResponseDto> {
    const url = await this.urlService.getUrlById(id);

    // check ownership
    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to update this URL');
    }

    const updatedUrl = await this.urlService.updateUrl(id, updateUrlDto);
    this.logger.log(`Updated URL: ${id}`);

    return plainToInstance(UrlResponseDto, updatedUrl, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  Delete URL (soft delete)
  */
  @Delete('api/urls/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUrl(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<void> {
    const url = await this.urlService.getUrlById(id);

    // check ownership
    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to delete this URL');
    }

    await this.urlService.deleteUrl(id);
    this.logger.log(`Deleted URL: ${id}`);
  }

  /* 
  Redirect short URL to original URL (strict rate limit)
  */
  @Public()
  @Get(':shortCode')
  @RateLimit({ ttl: 60, max: 30 })
  async redirectToOriginal(
    @Param('shortCode') shortCode: string,
    @Query('password') password: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    try {
      const url = await this.urlService.getUrlByShortCode(shortCode);

      const originalUrl = await this.urlService.getOriginalUrl(
        shortCode,
        password,
      );
      this.logger.debug(`Redirecting ${shortCode} to ${originalUrl}`);

      // Extranct request info for analytics
      const ipAddress = this.getClientIP(req);
      const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'] || '';
      const _refererHeader = req.headers['referer'] ?? req.headers['referrer'];
      const referer = Array.isArray(_refererHeader)
        ? _refererHeader[0]
        : _refererHeader || '';

      // Enqueue click tracking
      const clickEvent: ClickEventDto = {
        urlId: url.id,
        ipAddress,
        userAgent,
        referer,
      };

      await this.analyticsService.enqueueClickEvent(clickEvent);

      res.redirect(302, originalUrl);
    } catch (error) {
      this.logger.error(`Redirect error for ${shortCode}: ${error.message}`);

      res.status(error.status || 500).json({
        statusCode: error.status || 500,
        message: error.message,
        shortCode,
      });
    }
  }
  /* 
    Health check endpoint for monitoring
    */
  @Public()
  @Get('api/health')
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /* 
  Helper: Extract client IP from request
  */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-real-ip'];
    if (forwarded) {
      const ips = (forwarded as string).split(',');
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return realIp as string;
    }

    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }
}
