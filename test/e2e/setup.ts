import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// import modules
import { RateLimitModule } from '../../src/modules/rate-limit/rate-limit.module';
import { AnalyticsModule } from '../../src/modules/analytics/analytics.module';
import { SchedulerModule } from '../../src/modules/scheduler/scheduler.module';
import { QrcodeModule } from '../../src/modules/qrcode/qrcode.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { CacheModule } from '../../src/common/cache/cache.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UrlModule } from '../../src/modules/url/url.module';

// import entities
import { Click } from '../../src/modules/analytics/entities/click.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { User } from '../../src/modules/auth/entities/user.entity';
import { Url } from '../../src/modules/url/entities/url.entity';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

export let app: INestApplication;
export let dataSource: DataSource;

// setup before all tests
beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
        ignoreEnvFile: false,
      }),

      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          type: 'postgres',
          host: configService.get('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5433),
          username: configService.get('DB_USERNAME', 'test_user'),
          password: configService.get('DB_PASSWORD', 'test_password'),
          database: configService.get('DB_DATABASE', 'urlshortener_test_db'),
          entities: [Url, User, ApiKey, Click],
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
      }),

      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          connection: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6380),
            password: configService.get('REDIS_PASSWORD'),
            maxRetriesPerRequest: null,
            lazyConnect: true,
          },
        }),
      }),

      //   import all module
      CacheModule,
      UrlModule,
      AnalyticsModule,
      QrcodeModule,
      SchedulerModule,
      RateLimitModule,
      AdminModule,
      AuthModule,
    ],
  }).compile();

  app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.init();

  dataSource = app.get(DataSource);
}, 60000);

afterAll(async () => {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
  }
  if (app) {
    await app.close();
  }
}, 10000);

export const cleanDatabase = async () => {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error('DataSource not initialized');
  }

  const entities = dataSource.entityMetadatas;

  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(
      `TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE`,
    );
  }
};

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
