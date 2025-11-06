import { TypeOrmModule } from '@nestjs/typeorm';
import { Url } from './entities/url.entity';
import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([Url])],
})
export class UrlModule {}
