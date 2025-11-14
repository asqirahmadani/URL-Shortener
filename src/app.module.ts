import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { UrlModule } from './modules/url/url.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRedisConfig } from './common/config/redis.config';
import { getDatabaseConfig } from './common/config/database.config';
import { envValidationSchema } from './common/config/env.validation';
import { AnalyticsModule } from './modules/analytics/analytics.module';

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

    UrlModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
