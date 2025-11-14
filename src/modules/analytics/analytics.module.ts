import { TypeOrmModule } from '@nestjs/typeorm';
import { Click } from './entities/click.entity';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ClickProcessor } from './processors/click.processor/click.processor';
import { AnalyticsController } from './analytics.controller';
import { UserAgentParser } from './utils/user-agent.parser';
import { AnalyticsService } from './analytics.service';
import { GeoIpService } from './utils/geo-ip.service';
import { Url } from '../url/entities/url.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Click, Url]),
    BullModule.registerQueue({
      name: 'clicks',
    }),
    HttpModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ClickProcessor, UserAgentParser, GeoIpService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
