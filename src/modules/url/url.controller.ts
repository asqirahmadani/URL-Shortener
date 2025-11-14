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
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { Request, Response } from 'express';

import { PaginatedResponseDto } from './dto/paginated-url-response.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { ClickEventDto } from '../analytics/dto/click-event.dto';
import { UrlResponseDto } from './dto/url-response.dto';
import { CreateUrlDto } from './dto/create-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';
import { UrlService } from './url.service';

/*
 URL Controller - RESTful endpoints for URL Shortening
 */
@Controller()
export class UrlController {
  private readonly logger = new Logger(UrlController.name);

  constructor(
    private readonly urlService: UrlService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /* 
  Create short URL
  */
  @Post('/api/urls')
  @HttpCode(HttpStatus.CREATED)
  async createdShortUrl(
    @Body() createUrlDto: CreateUrlDto,
    @Req() req: Request,
  ): Promise<UrlResponseDto> {
    // Todo: Extract userId from JWT Token
    const userId = req.headers['x-user-id'] as string;

    const url = await this.urlService.createShortUrl(createUrlDto, userId);
    this.logger.log(`Created short URL: ${url.shortCode}`);

    return plainToInstance(UrlResponseDto, url, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  Get URL details by ID
  */
  @Get('api/urls/:id')
  async getUrlById(@Param('id') id: string): Promise<UrlResponseDto> {
    const url = await this.urlService.getUrlById(id);

    return plainToInstance(UrlResponseDto, url, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  List user's URLs with pagination
  */
  @Get('api/urls')
  async getUserUrls(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Req() req: Request,
  ): Promise<PaginatedResponseDto> {
    // Todo: Extract userId from JWT Token
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return {
        urls: [],
        total: 0,
        page: 1,
        totalPages: 0,
        limit: parseInt(limit),
      };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const result = await this.urlService.getUserUrls(userId, pageNum, limitNum);

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
  ): Promise<UrlResponseDto> {
    // Todo: Check ownership
    const url = await this.urlService.updateUrl(id, updateUrlDto);
    this.logger.log(`Updated URL: ${id}`);

    return plainToInstance(UrlResponseDto, url, {
      excludeExtraneousValues: true,
    });
  }

  /* 
  Delete URL (soft delete)
  */
  @Delete('api/urls/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUrl(@Param('id') id: string): Promise<void> {
    // Todo: check ownership
    await this.urlService.deleteUrl(id);
    this.logger.log(`Deleted URL: ${id}`);
  }

  /* 
  Redirect short URL to original URL
  */
  @Get(':shortCode')
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
