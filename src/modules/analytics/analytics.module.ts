import { TypeOrmModule } from '@nestjs/typeorm';
import { Click } from './entities/click.entity';
import { Module } from '@nestjs/common';

@Module({
  imports: [TypeOrmModule.forFeature([Click])],
})
export class AnalyticsModule {}
