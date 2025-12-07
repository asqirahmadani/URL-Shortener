import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Header,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimitGuard } from '../rate-limit/guards/rate-limit.guard';
import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LocationStatsDto } from './dto/location-stats.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { TimelineDataDto } from './dto/timeline-data.dto';
import { DeviceStatsDto } from './dto/device-stats.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';

/* 
Analytics Controller - Endpoints for analytics data
*/
@ApiTags('analytics')
@Controller('api/analytics')
@UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /* 
  Get analytics overview
  */
  @ApiOperation({ summary: 'Get analytics overview' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/overview')
  async getOverview(
    @Param('shortCode') shortCode: string,
    @CurrentUser() user: any,
  ): Promise<AnalyticsOverviewDto> {
    return this.analyticsService.getAnalyticsOverview(shortCode, user);
  }

  /* 
  Get timeline data
  */
  @ApiOperation({ summary: 'Get timeline data' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/timeline')
  async getTimeLine(
    @Param('shortCode') shortCode: string,
    @Query('interval') interval: 'hour' | 'day' | 'week' = 'day',
    @Query('days') days: string = '30',
    @CurrentUser() user: any,
  ): Promise<TimelineDataDto> {
    const daysNum = Math.min(365, Math.max(1, parseInt(days)));
    return this.analyticsService.getTimelineData(
      shortCode,
      interval,
      daysNum,
      user,
    );
  }

  /* 
  Get location statistics
  */
  @ApiOperation({ summary: 'Get location stats' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/locations')
  async getLocations(
    @Param('shortCode') shortCode: string,
    @CurrentUser() user: any,
  ): Promise<LocationStatsDto> {
    return this.analyticsService.getLocationStats(shortCode, user);
  }

  /* 
  Get device statistics
  */
  @ApiOperation({ summary: 'Get device statistics' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/devices')
  async getDevices(
    @Param('shortCode') shortCode: string,
    @CurrentUser() user: any,
  ): Promise<DeviceStatsDto> {
    return this.analyticsService.getDeviceStats(shortCode, user);
  }

  /* 
  Get referrer statistics
  */
  @ApiOperation({ summary: 'Get referrer statistics' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/referrers')
  async getReferrers(
    @Param('shortCode') shortCode: string,
    @CurrentUser() user: any,
  ): Promise<Array<{ referer: string; clicks: number }>> {
    return this.analyticsService.getReferrerStats(shortCode, user);
  }

  /* 
  Get heatmap data
  */
  @ApiOperation({ summary: 'Get heatmap data' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/heatmap')
  async getGeatmap(
    @Param('shortCode') shortCode: string,
    @Query('days') days: string = '7',
    @CurrentUser() user: any,
  ): Promise<any> {
    const daysNum = Math.min(30, Math.max(1, parseInt(days)));
    return this.analyticsService.getHeatmapData(shortCode, daysNum, user);
  }

  /* 
  Export analytics as CSV
  */
  @ApiOperation({ summary: 'Export analytics as CSV' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'URL tidak ditemukan' })
  @ApiBearerAuth()
  @Get(':shortCode/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="analytics.csv"')
  async exportAnalytics(
    @Param('shortCode') shortCode: string,
    @CurrentUser() user: any,
  ): Promise<string> {
    this.logger.log(`Exporting analytics for ${shortCode}`);
    return this.analyticsService.exportAnalytics(shortCode, user);
  }
}
