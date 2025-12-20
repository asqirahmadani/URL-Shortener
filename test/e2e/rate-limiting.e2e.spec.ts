import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import * as dotenv from 'dotenv';
import request from 'supertest';
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

import { RateLimitService } from '../../src/modules/rate-limit/rate-limit.service';
import { CacheService } from '../../src/common/cache/cache.service';
import { cleanDatabase } from './setup';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('Rate Limiting (E2E)', () => {
  let app: INestApplication;
  let accessToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();

    // register user
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'ratelimit@example.com',
        name: 'Rate Limit User',
        password: 'Password123!',
      });

    accessToken = registerResponse.body.accessToken;

    const cacheService = app.get(CacheService);
    await cacheService.reset();
  });

  describe('URL Creation Rate Limiting', () => {
    beforeEach(async () => {
      const rateLimitService = app.get(RateLimitService);
      await rateLimitService.resetRateLimit('127.0.0.1');
      await rateLimitService.resetRateLimit('::1');
      await rateLimitService.resetRateLimit('::ffff:127.0.0.1');
    });

    it('should allow requests within limit', async () => {
      // make 5 requests (assuming limit is 5 per minute)
      for (let i = 0; i < 5; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/urls')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            originalUrl: `https://example.com/${i}`,
          })
          .expect(201);

        expect(response.headers).toHaveProperty('x-ratelimit-limit');
        expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      }
    });

    it('should block requests exceeding limit', async () => {
      // make requests up to limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/urls')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            originalUrl: `https://example.com/${i}`,
          })
          .expect(201);
      }

      // next request should be blocked
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com/blocked',
        })
        .expect(429);

      expect(response.body.message).toContain('Too many requests');
      expect(response.body).toHaveProperty('retryAfter');
    });

    it('should include rate limit headers', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
        })
        .expect(201);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Redirect Rate Limiting', () => {
    let shortCode: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
        });

      shortCode = createResponse.body.shortCode;
    });

    it('should allow multiple redirects', async () => {
      // redirects typically have higher limits (e.g., 30 per minute)
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get(`/${shortCode}`)

          .expect(302);
      }
    });

    it('should block excessive redirects', async () => {
      // make requests up to limit (assuming 30)
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer()).get(`/${shortCode}`);
      }

      // next request should be blocked
      const response = await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(429);

      expect(response.body.message).toContain('Too many requests');
    });
  });

  describe('Authentication Rate Limiting', () => {
    it('should limit login attempts', async () => {
      // make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'ratelimit@example.com',
            password: 'WrongPassword123!',
          })
          .expect(401);
      }

      // next attempt should be rate limited
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'ratelimit@example.com',
          password: 'Password123!',
        })
        .expect(429);

      expect(response.body.message).toContain('Too many requests');
    });
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit after TTL expires', async () => {
      // make requests up to limit
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/urls')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            originalUrl: `https://example.com/${i}`,
          })
          .expect(201);
      }

      // should be blocked
      await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com/blocked',
        })
        .expect(429);

      // wait for TTL to expire (e.g., 60 seconds)
      const ttl = 60;
      await new Promise((resolve) => setTimeout(resolve, (ttl + 2) * 1000));

      // should work again
      await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com/after-reset',
        })
        .expect(201);
    }, 70000); // increase test timeout
  });
});
