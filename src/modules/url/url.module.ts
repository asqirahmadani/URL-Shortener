import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { UrlPreviewService } from './url-preview.service';
import { UrlController } from './url.controller';
import { Url } from './entities/url.entity';
import { UrlService } from './url.service';

@Module({
  imports: [TypeOrmModule.forFeature([Url]), AnalyticsModule],
  controllers: [UrlController],
  providers: [UrlService, UrlPreviewService],
  exports: [UrlService, UrlPreviewService],
})
export class UrlModule {}
