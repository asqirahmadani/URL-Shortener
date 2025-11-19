import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Click } from '../../analytics/entities/click.entity';
import { Url } from '../../url/entities/url.entity';

/* 
Sync Count Task - Synchronized cached click counts with actual DB
*/
@Injectable()
export class SyncCountsTask {
  private readonly logger = new Logger(SyncCountsTask.name);

  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  /* 
  Sync click counts (every hour)
  */
  @Cron(CronExpression.EVERY_HOUR)
  async syncClickCounts(): Promise<void> {
    this.logger.log('Starting click count synchronization...');

    try {
      // Get all URLs with clicks
      const urls = await this.urlRepository.find({
        where: { clickCount: 0 },
        take: 1000,
      });

      let syncedCount = 0;

      for (const url of urls) {
        // Count actual clicks in DB
        const actualCount = await this.clickRepository.count({
          where: { urlId: url.id },
        });

        // Update if different
        if (url.clickCount !== actualCount) {
          await this.urlRepository.update(url.id, {
            clickCount: actualCount,
          });
          syncedCount++;
        }
      }

      this.logger.log(`Synced ${syncedCount} URL click counts`);
    } catch (error) {
      this.logger.error(`Count sync failed: ${error.message}`, error.stack);
    }
  }

  /* 
  Recalculate analytics cache (every 15 minutes)
  */
  @Cron('*/15 * * * *')
  async recalculateAnalyticsCache(): Promise<void> {
    // TODO: Implement analytics cache warming
    // Get top 100 most accessed URLs
    // Pre-calculate their analytics
    // Warm up cache
    this.logger.debug('Analytics cache recalculation (TODO)');
  }
}
