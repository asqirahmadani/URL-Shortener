import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { UrlController } from './url.controller';
import { Url } from './entities/url.entity';
import { UrlService } from './url.service';

@Module({
  imports: [TypeOrmModule.forFeature([Url]), AnalyticsModule],
  controllers: [UrlController],
  providers: [UrlService],
  exports: [UrlService],
})
export class UrlModule {}
