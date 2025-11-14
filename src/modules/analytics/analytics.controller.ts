import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Header,
} from '@nestjs/common';

import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import { LocationStatsDto } from './dto/location-stats.dto';
import { TimelineDataDto } from './dto/timeline-data.dto';
import { DeviceStatsDto } from './dto/device-stats.dto';
import { AnalyticsService } from './analytics.service';

/* 
Analytics Controller - Endpoints for analytics data
*/
@Controller('api/analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /* 
  Get analytics overview
  */
  @Get(':shortCode/overview')
  async getOverview(
    @Param('shortCode') shortCode: string,
  ): Promise<AnalyticsOverviewDto> {
    return this.analyticsService.getAnalyticsOverview(shortCode);
  }

  /* 
  Get timeline data
  */
  @Get(':shortCode/timeline')
  async getTimeLine(
    @Param('shortCode') shortCode: string,
    @Query('interval') interval: 'hour' | 'day' | 'week' = 'day',
    @Query('days') days: string = '30',
  ): Promise<TimelineDataDto> {
    const daysNum = Math.min(365, Math.max(1, parseInt(days)));
    return this.analyticsService.getTimelineData(shortCode, interval, daysNum);
  }

  /* 
  Get location statistics
  */
  @Get(':shortCode/locations')
  async getLocations(
    @Param('shortCode') shortCode: string,
  ): Promise<LocationStatsDto> {
    return this.analyticsService.getLocationStats(shortCode);
  }

  /* 
  Get device statistics
  */
  @Get(':shortCode/devices')
  async getDevices(
    @Param('shortCode') shortCode: string,
  ): Promise<DeviceStatsDto> {
    return this.analyticsService.getDeviceStats(shortCode);
  }

  /* 
  Get referrer statistics
  */
  @Get(':shortCode/referrers')
  async getReferrers(
    @Param('shortCode') shortCode: string,
  ): Promise<Array<{ referer: string; clicks: number }>> {
    return this.analyticsService.getReferrerStats(shortCode);
  }

  /* 
  Get heatmap data
  */
  @Get(':shortCode/heatmap')
  async getGeatmap(
    @Param('shortCode') shortCode: string,
    @Query('days') days: string = '7',
  ): Promise<any> {
    const daysNum = Math.min(30, Math.max(1, parseInt(days)));
    return this.analyticsService.getHeatmapData(shortCode, daysNum);
  }

  /* 
  Export analytics as CSV
  */
  @Get(':shortCode/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="analytics.csv"')
  async exportAnalytics(
    @Param('shortCode') shortCode: string,
  ): Promise<string> {
    this.logger.log(`Exporting analytics for ${shortCode}`);
    return this.analyticsService.exportAnalytics(shortCode);
  }
}
