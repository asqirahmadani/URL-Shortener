import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';

import { Click } from '../analytics/entities/click.entity';
import { AdminController } from './admin.controller';
import { Url } from '../url/entities/url.entity';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Url, Click])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
