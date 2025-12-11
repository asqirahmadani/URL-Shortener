import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';

import { AnalyticsOverviewDto } from './dto/analytics-overview.dto';
import { CacheService } from '../../common/cache/cache.service';
import { UserAgentParser } from './utils/user-agent.parser';
import { LocationStatsDto } from './dto/location-stats.dto';
import { TimelineDataDto } from './dto/timeline-data.dto';
import { DeviceStatsDto } from './dto/device-stats.dto';
import { UserRole } from '../auth/entities/user.entity';
import { ClickEventDto } from './dto/click-event.dto';
import { GeoIpService } from './utils/geo-ip.service';
import { Url } from '../url/entities/url.entity';
import { Click } from './entities/click.entity';

/* 
Analytics Service - Core logic for tracking & analytics

Flow:
1.  User click short URL -> Controller enqueue job
2.  Worker process job -> Parse UA, get geo -> save to db
3.  Analytics queries -> Aggreagate data -> Cache result
*/
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    @InjectQueue('clicks')
    private readonly clickQueue: Queue,
    private readonly userAgentParser: UserAgentParser,
    private readonly geoIpService: GeoIpService,
    private readonly cacheService: CacheService,
  ) {}

  /* 
  Enqueue click event (called from UrlController when redirecting)
  */
  async enqueueClickEvent(clickEventDto: ClickEventDto): Promise<void> {
    await this.clickQueue.add('record-click', clickEventDto, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.debug(`Enqueued click event for URL: ${clickEventDto.urlId}`);
  }

  /* 
  Process click event (called from worker)
  Parse UA, get geolocation, save to db
  */
  async processClickEvent(clickEventDto: ClickEventDto): Promise<void> {
    const { urlId, ipAddress, userAgent, referer } = clickEventDto;

    // Parse user agent
    const uaData = this.userAgentParser.parse(userAgent!);

    // Get geolocation
    const geoData = await this.geoIpService.getLocation(ipAddress);

    // Create click record
    const click = this.clickRepository.create({
      urlId,
      ipAddress,
      userAgent: userAgent || null,
      referer: referer || null,
      browser: uaData.browser,
      browserVersion: uaData.browserVersion,
      os: uaData.os,
      osVersion: uaData.osVersion,
      deviceType: uaData.deviceType,
      country: geoData.country,
      city: geoData.city,
      latitude: geoData.latitude,
      longitude: geoData.longitude,
      timezone: geoData.timezone,
    });

    await this.clickRepository.save(click);
    // Increment cached click count in URL table
    await this.urlRepository.increment({ id: urlId }, 'clickCount', 1);

    // Invalidate analytics cache
    const url = await this.urlRepository.findOne({ where: { id: urlId } });
    if (url) {
      await this.cacheService.invalidateAnalyticsCache(url.shortCode);
    }

    this.logger.debug(
      `Recorded click for URL ${urlId} and invalidated cache from ${ipAddress}`,
    );
  }

  /* 
  Get analytics overview for specific URL
  */
  async getAnalyticsOverview(
    shortCode: string,
    user: any,
  ): Promise<AnalyticsOverviewDto> {
    const cacheKey = this.cacheService.analyticsOverviewKey(shortCode);

    // Cache-aside with wrap
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const url = await this.urlRepository.findOne({
          where: { shortCode },
        });

        if (!url) {
          throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
        }

        if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
          throw new UnauthorizedException('Not authorized to get analytics');
        }

        // Aggregate queries
        const totalClicks = await this.clickRepository.count({
          where: { urlId: url.id },
        });

        const uniqueVisitors = await this.clickRepository
          .createQueryBuilder('click')
          .select('COUNT(DISTINCT click.ipAddress)', 'count')
          .where('click.urlId = :urlId', { urlId: url.id })
          .getRawOne();

        const topCountry = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.country')
          .addSelect('COUNT(*)', 'count')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.country IS NOT NULL')
          .groupBy('click.country')
          .orderBy('count', 'DESC')
          .limit(1)
          .getRawOne();

        const topDevice = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.deviceType')
          .addSelect('COUNT(*)', 'count')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.deviceType IS NOT NULL')
          .groupBy('click.deviceType')
          .orderBy('count', 'DESC')
          .limit(1)
          .getRawOne();

        const topBrowser = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.browser')
          .addSelect('COUNT(*)', 'count')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.browser IS NOT NULL')
          .groupBy('click.browser')
          .orderBy('count', 'DESC')
          .limit(1)
          .getRawOne();

        const lastClick = await this.clickRepository.findOne({
          where: { urlId: url.id },
          order: { createdAt: 'DESC' },
        });

        // Calculate average clicks per day
        const daySinceCreation = Math.max(
          1,
          Math.floor(
            (Date.now() - url.createdAt.getTime()) / (1000 * 60 * 60 * 24),
          ),
        );

        const averageClicksPerDay = totalClicks / daySinceCreation;

        return {
          totalClicks,
          uniqueVisitors: parseInt(uniqueVisitors.count || '0'),
          topCountry: topCountry.click_country || 'Unknown',
          topDevice: topDevice.click_deviceType || 'Unknown',
          topBrowser: topBrowser.click_browser || 'Unknown',
          averageClicksPerDay: Math.round(averageClicksPerDay * 100) / 100,
          lastClickAt: lastClick?.createdAt || null,
          createdAt: url.createdAt,
        };
      },
      this.cacheService.getTTL('ANALYTICS_OVERVIEW'),
    );
  }

  /* 
  Get timeline data (clicks over time)
  */
  async getTimelineData(
    shortCode: string,
    interval: 'hour' | 'day' | 'week' | 'month',
    days: number = 30,
    user: any,
  ): Promise<TimelineDataDto> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const cacheKey = this.cacheService.analyticsTimelineKey(
      shortCode,
      interval,
      days,
    );

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const url = await this.urlRepository.findOne({
          where: { shortCode },
        });

        if (!url) {
          throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
        }

        let truncFormat: string;
        switch (interval) {
          case 'hour':
            truncFormat = 'hour';
            break;

          case 'week':
            truncFormat = 'week';
            break;

          default:
            truncFormat = 'day';
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const rawData = await this.clickRepository
          .createQueryBuilder('click')
          .select(`DATE_TRUNC('${truncFormat}', click.createdAt)`, 'timestamp')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.createdAt >= :startDate', { startDate })
          .groupBy('timestamp')
          .orderBy('timestamp', 'ASC')
          .getRawMany();

        const data = rawData.map((row) => ({
          timestamp: new Date(row.timestamp).toISOString(),
          clicks: parseInt(row.clicks),
        }));

        const totalClicks = data.reduce((sum, point) => sum + point.clicks, 0);

        return {
          data,
          interval,
          totalClicks,
        };
      },
      this.cacheService.getTTL('ANALYTICS_TIMELINE'),
    );
  }

  /* 
  Get location statistics
  */
  async getLocationStats(
    shortCode: string,
    user: any,
  ): Promise<LocationStatsDto> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const cacheKey = this.cacheService.analyticsLocationsKey(shortCode);

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const url = await this.urlRepository.findOne({
          where: { shortCode },
        });

        if (!url) {
          throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
        }

        // Country stats
        const countryData = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.country', 'countryCode')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.country IS NOT NULL')
          .groupBy('click.country')
          .orderBy('clicks', 'DESC')
          .limit(10)
          .getRawMany();

        const totalCountryClick = countryData.reduce(
          (sum, item) => sum + parseInt(item.clicks),
          0,
        );

        const countries = countryData.map((item) => ({
          country: this.getCountryName(item.countryCode),
          countryCode: item.countryCode,
          clicks: parseInt(item.clicks),
          percentage:
            Math.round((parseInt(item.clicks) / totalCountryClick) * 10000) /
            100,
        }));

        // City stats
        const cityData = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.city', 'city')
          .addSelect('click.country', 'country')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.city IS NOT NULL')
          .groupBy('click.city, click.country')
          .orderBy('clicks', 'DESC')
          .limit(10)
          .getRawMany();

        const cities = cityData.map((item) => ({
          city: item.city,
          country: item.country,
          clicks: parseInt(item.clicks),
        }));

        return {
          countries,
          cities,
          totalClicks: totalCountryClick,
        };
      },
      this.cacheService.getTTL('ANALYTICS_OVERVIEW'),
    );
  }

  /* 
  Get device statistics
  */
  async getDeviceStats(shortCode: string, user: any): Promise<DeviceStatsDto> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const cacheKey = this.cacheService.analyticsDevicesKey(shortCode);

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const url = await this.urlRepository.findOne({
          where: { shortCode },
        });

        if (!url) {
          throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
        }

        // Device type stats
        const deviceTypeData = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.deviceType', 'deviceType')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.deviceType IS NOT NULL')
          .groupBy('click.deviceType')
          .orderBy('clicks', 'DESC')
          .getRawMany();

        const totalClicks = deviceTypeData.reduce(
          (sum, item) => sum + parseInt(item.clicks),
          0,
        );

        const byType = deviceTypeData.map((item) => ({
          deviceType: item.deviceType,
          clicks: parseInt(item.clicks),
          percentage:
            Math.round((parseInt(item.clicks) / totalClicks) * 10000) / 100,
        }));

        // Browser stats
        const browserData = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.browser', 'browser')
          .addSelect('click.browserVersion', 'version')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.browser IS NOT NULL')
          .groupBy('click.browser, click.browserVersion')
          .orderBy('clicks', 'DESC')
          .limit(10)
          .getRawMany();

        const byBrowser = browserData.map((item) => ({
          browser: item.browser,
          version: item.version,
          clicks: parseInt(item.clicks),
          percentage:
            Math.round((parseInt(item.clicks) / totalClicks) * 10000) / 100,
        }));

        // OS stats
        const osData = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.os', 'os')
          .addSelect('click.osVersion', 'version')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.os IS NOT NULL')
          .groupBy('click.os, click.osVersion')
          .orderBy('clicks', 'DESC')
          .limit(10)
          .getRawMany();

        const byOS = osData.map((item) => ({
          os: item.os,
          version: item.version,
          clicks: parseInt(item.clicks),
          percentage:
            Math.round((parseInt(item.clicks) / totalClicks) * 10000) / 100,
        }));

        return {
          byType,
          byBrowser,
          byOS,
          totalClicks,
        };
      },
      this.cacheService.getTTL('ANALYTICS_OVERVIEW'),
    );
  }

  /* 
  Get referrer statistics
  */
  async getReferrerStats(
    shortCode: string,
    user: any,
  ): Promise<Array<{ referer: string; clicks: number }>> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const cacheKey = this.cacheService.analyticsReferrersKey(shortCode);

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const url = await this.urlRepository.findOne({
          where: { shortCode },
        });

        if (!url) {
          throw new NotFoundException(`URL ${shortCode} tidak ditemukan`);
        }

        const data = await this.clickRepository
          .createQueryBuilder('click')
          .select('click.referer', 'referer')
          .addSelect('COUNT(*)', 'clicks')
          .where('click.urlId = :urlId', { urlId: url.id })
          .andWhere('click.referer IS NOT NULL')
          .groupBy('click.referer')
          .orderBy('clicks', 'DESC')
          .limit(20)
          .getRawMany();

        return data.map((item) => ({
          referer: item.referer || 'Direct',
          clicks: parseInt(item.clicks),
        }));
      },
      this.cacheService.getTTL('ANALYTICS_OVERVIEW'),
    );
  }

  /* 
  Get heatmap data for visualization
  */
  async getHeatmapData(
    shortCode: string,
    days: number = 7,
    user: any,
  ): Promise<
    Array<{
      hour: number;
      day: string;
      country: string;
      clicks: number;
    }>
  > {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await this.clickRepository
      .createQueryBuilder('click')
      .select('EXTRACT(HOUR FROM click.createdAt)', 'hour')
      .addSelect("TO_CHAR(click.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('click.country', 'country')
      .addSelect('COUNT(*)', 'clicks')
      .where('click.urlId = :urlId', { urlId: url.id })
      .andWhere('click.createdAt >= :startDate', { startDate })
      .andWhere('click.country IS NOT NULL')
      .groupBy('hour, day, click.country')
      .orderBy('day', 'ASC')
      .addOrderBy('hour', 'ASC')
      .getRawMany();

    return data.map((row) => ({
      hour: parseInt(row.hour),
      day: row.day,
      country: row.country,
      clicks: parseInt(row.clicks),
    }));
  }

  /* 
  Export analytics data as CSV
  */
  async exportAnalytics(shortCode: string, user: any): Promise<string> {
    const url = await this.urlRepository.findOne({
      where: { shortCode },
    });

    if (!url) {
      throw new NotFoundException(`URL ${shortCode} tidak ditemukan!`);
    }

    if (url.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Not authorized to get timeline');
    }

    const clicks = await this.clickRepository.find({
      where: { urlId: url.id },
      order: { createdAt: 'DESC' },
    });

    // Conver to CSV format
    const header = [
      'Timestamp',
      'IP Address',
      'Country',
      'City',
      'Device',
      'Browser',
      'OS',
      'Referer',
    ].join(',');

    const rows = clicks.map((click) =>
      [
        click.createdAt.toISOString(),
        click.ipAddress,
        click.country || '',
        click.city || '',
        click.deviceType || '',
        click.browser || '',
        click.os || '',
        click.referer || '',
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  /* 
  Helper: Get country name from code
  */
  private getCountryName(code: string): string {
    const countries: Record<string, string> = {
      ID: 'Indonesia',
      US: 'United States',
      SG: 'Singapore',
      MY: 'Malaysia',
      TH: 'Thailand',
      VN: 'Vietnam',
      PH: 'Philippines',
      IN: 'India',
      CN: 'China',
      JP: 'Japan',
      KR: 'South Korea',
      GB: 'United Kingdom',
      DE: 'Germany',
      FR: 'France',
      AU: 'Australia',
    };

    return countries[code] || code;
  }
}
