import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { envValidationSchema } from './common/config/env.validation';
import { getDatabaseConfig } from './common/config/database.config';
import { getRedisConfig } from './common/config/redis.config';
import { QrcodeModule } from './modules/qrcode/qrcode.module';
import { AdminModule } from './modules/admin/admin.module';
import { CacheModule } from './common/cache/cache.module';
import { UrlModule } from './modules/url/url.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Database connection
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService),
    }),

    // Redis for BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: getRedisConfig(configService),
      }),
      inject: [ConfigService],
    }),

    CacheModule,
    UrlModule,
    AnalyticsModule,
    QrcodeModule,
    SchedulerModule,
    RateLimitModule,
    AdminModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
