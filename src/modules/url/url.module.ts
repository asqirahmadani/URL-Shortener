import { TypeOrmModule } from '@nestjs/typeorm';
import { Url } from './entities/url.entity';
import { Module } from '@nestjs/common';
import { UrlController } from './url.controller';
import { UrlService } from './url.service';

@Module({
  imports: [TypeOrmModule.forFeature([Url])],
  controllers: [UrlController],
  providers: [UrlService],
  exports: [UrlService],
})
export class UrlModule {}
