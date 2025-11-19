import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { Click } from '../../analytics/entities/click.entity';
import { UrlService } from '../../url/url.service';

/* 
Cleanup Task - Automated cleanup for expired URLs & old clicks
*/
@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    private readonly urlService: UrlService,
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
  ) {}

  /* 
  Cleanup expired URLs (every 2 AM)
  */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredUrls(): Promise<void> {
    this.logger.log('Starting expired URLs cleanup...');

    try {
      const deletedCount = await this.urlService.cleanUpExpiredUrls();
      this.logger.log(`Cleaned up ${deletedCount} expired URLs`);
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`, error.stack);
    }
  }

  /* 
  Cleanup old click records (older than 6 months)
  */
  @Cron('0 3 * * 0') // Every sunday at 3 AM
  async cleanupOldClicks(): Promise<void> {
    this.logger.log('Starting old clicks cleanup...');

    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const result = await this.clickRepository
        .createQueryBuilder()
        .delete()
        .where('createdAt < :date', { date: sixMonthsAgo })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} old click records`);
    } catch (error) {
      this.logger.error(`Click cleanup failed: ${error.message}`, error.stack);
    }
  }

  /* 
  Cleanup soft-deleted URLs (hard delete after 30 days)
  */
  @Cron(CronExpression.EVERY_WEEK)
  async hardDeleteSoftDeletedUrls(): Promise<void> {
    this.logger.log('Starting hard delete of soft-deleted URLs...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.urlService['urlRepository']
        .createQueryBuilder()
        .delete()
        .where('deletedAt IS NOT NULL')
        .andWhere('deletedAt < :date', { date: thirtyDaysAgo })
        .execute();

      this.logger.log(`Hard deleted ${result.affected} old soft-deleted URLs`);
    } catch (error) {
      this.logger.error(`Hard delete failed: ${error.message}`, error.stack);
    }
  }
}
