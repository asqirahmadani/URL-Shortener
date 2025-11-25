import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Click } from '../analytics/entities/click.entity';
import { Url } from '../url/entities/url.entity';

/* 
Admin Service - admin dashboard & management
*/
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  /* 
    Get system statistics
    */
  async getSystemStats(): Promise<{
    urls: { total: number; active: number; expired: number };
    clicks: { total: number; today: number; thisWeek: number };
    topUrls: Array<{ shortCode: string; clicks: number }>;
  }> {
    const totalUrls = await this.urlRepository.count();
    const activeUrls = await this.urlRepository.count({
      where: { isActive: true },
    });

    const expiredUrls = await this.urlRepository
      .createQueryBuilder('url')
      .where('url.expiresAt < :now', { now: new Date() })
      .getCount();

    const totalClicks = await this.clickRepository.count();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clicksToday = await this.clickRepository.count({
      where: { createdAt: today },
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const clicksThisWeek = await this.clickRepository.count({
      where: { createdAt: weekAgo },
    });

    const topUrls = await this.urlRepository.find({
      order: { clickCount: 'DESC' },
      take: 10,
      select: ['shortCode', 'clickCount'],
    });

    return {
      urls: {
        total: totalUrls,
        active: activeUrls,
        expired: expiredUrls,
      },
      clicks: {
        total: totalClicks,
        today: clicksToday,
        thisWeek: clicksThisWeek,
      },
      topUrls: topUrls.map((url) => ({
        shortCode: url.shortCode,
        clicks: url.clickCount,
      })),
    };
  }

  /* 
  Get recent activity
  */
  async getRecentActivity(limit: number = 20): Promise<{
    recentUrls: Url[];
    recentClicks: Click[];
  }> {
    const recentUrls = await this.urlRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const recentClicks = await this.clickRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['url'],
    });

    return {
      recentUrls,
      recentClicks,
    };
  }
}
