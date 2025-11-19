import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { Click } from '../analytics/entities/click.entity';
import { SyncCountsTask } from './tasks/sync-count.task';
import { CleanupTask } from './tasks/cleanup.task';
import { Url } from '../url/entities/url.entity';
import { UrlModule } from '../url/url.module';

/* 
Scheduler Module - Manage all cron jobs
*/
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Url, Click]),
    UrlModule,
  ],
  providers: [CleanupTask, SyncCountsTask],
})
export class SchedulerModule {}
