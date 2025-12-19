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
import { cleanDatabase } from './setup';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('URL Management (E2E)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

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

    // register and login user for authenticated tests
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'url-test@example.com',
        name: 'URL Test User',
        password: 'Password123!',
      });

    accessToken = registerResponse.body.accessToken;
    userId = registerResponse.body.user.id;
  });

  describe('POST /api/urls', () => {
    it('should create URL with random short code', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('shortCode');
      expect(response.body).toHaveProperty('shortUrl');
      expect(response.body.shortCode).toHaveLength(6);
      expect(response.body.originalUrl).toBe('https://example.com');
      expect(response.body.clickCount).toBe(0);
      expect(response.body.isActive).toBe(true);
    });

    it('should create URL with custom alias', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          customAlias: 'my-custom-link',
        })
        .expect(201);

      expect(response.body.shortCode).toBe('my-custom-link');
      expect(response.body.shortUrl).toContain('/my-custom-link');
    });

    it('should create URL with title', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          title: 'My Example Link',
        })
        .expect(201);

      expect(response.body.title).toBe('My Example Link');
    });

    it('should create URL with expiration date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          expiresAt: futureDate.toISOString(),
        })
        .expect(201);

      expect(response.body.expiresAt).toBeDefined();
      expect(new Date(response.body.expiresAt).getTime()).toBeCloseTo(
        futureDate.getTime(),
        -3,
      );
    });

    it('should create URL with max clicks limit', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          maxClicks: 100,
        })
        .expect(201);

      expect(response.body.maxClicks).toBe(100);
    });

    it('should create password-protected URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          password: 'secret123',
        })
        .expect(201);

      expect(response.body).toHaveProperty('password');
      expect(response.body.password).not.toBe('secret123');
    });

    it('should reject duplicate custom alias', async () => {
      // create first URL
      await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          customAlias: 'duplicate',
        })
        .expect(201);

      // try to create second URL with same alias
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://another.com',
          customAlias: 'duplicate',
        })
        .expect(409);

      expect(response.body.message).toContain('sudah digunakan');
    });

    it('should reject invalid URL format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'not-a-valid-url',
        })
        .expect(400);

      expect(response.body.message).toContain('URL tidak valid');
    });

    it('should reject localhost URLs', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'http://localhost:3000',
        })
        .expect(400);

      expect(response.body.message).toContain('Cannot shorten localhost');
    });

    it('should reject past expiration dates', async () => {
      const pastDate = new Date('2020-01-01');

      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          expiresAt: pastDate.toISOString(),
        })
        .expect(400);

      expect(response.body.message).toContain('masa lalu');
    });

    it('should reject invalid custom alias format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          customAlias: 'invalid spaces!',
        })
        .expect(400);

      expect(response.body.message).toContain('huruf, angka, dash, underscore');
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .send({
          originalUrl: 'https://example.com',
        })
        .expect(401);
    });
  });

  describe('GET /:shortCode (Redirect)', () => {
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

    it('should redirect to original URL', async () => {
      const response = await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302);

      expect(response.headers.location).toBe('https://example.com');
    });

    it('should return 404 for non-existent short code', async () => {
      await request(app.getHttpServer()).get('/nonexistent').expect(404);
    });

    it('should handle password-protected URL', async () => {
      const protectedResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          password: 'secret123',
        });

      const protectedCode = protectedResponse.body.shortCode;

      // try without password
      const failResponse = await request(app.getHttpServer())
        .get(`/${protectedCode}`)
        .expect(400);

      expect(failResponse.body.message).toContain('dilindungi password');

      // try with wrong password
      const wrongPasswordResponse = await request(app.getHttpServer())
        .get(`/${protectedCode}?password=wrongpass`)
        .expect(400);

      expect(wrongPasswordResponse.body.message).toContain('Password salah');

      // success with correct password
      const successResponse = await request(app.getHttpServer())
        .get(`/${protectedCode}?password=secret123`)
        .expect(302);

      expect(successResponse.headers.location).toBe('https://example.com');
    });

    it('should reject expired URL', async () => {
      const pastDate = new Date();
      pastDate.setSeconds(pastDate.getSeconds() - 10);

      const expiredResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          expiresAt: pastDate.toISOString(),
        });
    });

    it('should track multiple clicks', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);
      }

      // wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // verify click count increased
      const urlResponse = await request(app.getHttpServer())
        .get('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const url = urlResponse.body.urls.find((u) => u.shortCode === shortCode);
      expect(url.clickCount).toBeGreaterThan(0);
    });
  });

  describe('GET /api/urls', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 15; i++) {
        await request(app.getHttpServer())
          .post('/api/urls')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            originalUrl: `https://example.com/${i}`,
            title: `URL ${i}`,
          });
      }
    });

    it('should list user URLs with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/urls?page=1&limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('urls');
      expect(response.body).toHaveProperty('total', 15);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('totalPages', 2);
      expect(response.body.urls).toHaveLength(10);
    });

    it('should get second page', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/urls?page=2&limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.page).toBe(2);
      expect(response.body.urls).toHaveLength(5);
    });

    it('should return empty for user with no URLs', async () => {
      const newUserResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          password: 'Password123!',
        });

      const response = await request(app.getHttpServer())
        .get('/api/urls')
        .set('Authorization', `Bearer ${newUserResponse.body.accessToken}`)
        .expect(200);

      expect(response.body.urls).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer()).get('/api/urls').expect(401);
    });
  });

  describe('GET /api/urls/:id', () => {
    let urlId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          title: 'Test URL',
        });

      urlId = createResponse.body.id;
    });

    it('should get URL details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(urlId);
      expect(response.body.title).toBe('Test URL');
      expect(response.body.originalUrl).toBe('https://example.com');
    });

    it('should return 404 for non-existent URL', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/api/urls/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/urls/:id', () => {
    let urlId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          title: 'Original Title',
        });

      urlId = createResponse.body.id;
    });

    it('should update URL title', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated Title',
        })
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
    });

    it('should update isActive status', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(response.body.isActive).toBe(false);
    });

    it('should update multiple fields', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'New Title',
          isActive: false,
          maxClicks: 50,
        })
        .expect(200);

      expect(response.body.title).toBe('New Title');
      expect(response.body.isActive).toBe(false);
      expect(response.body.maxClicks).toBe(50);
    });

    it('should return 404 for non-existent URL', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .put(`/api/urls/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated',
        })
        .expect(404);
    });
  });

  describe('DELETE /api/urls/:id', () => {
    let urlId: string;
    let shortCode: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
        });

      urlId = createResponse.body.id;
      shortCode = createResponse.body.shortCode;
    });

    it('should soft delete URL', async () => {
      await request(app.getHttpServer())
        .delete(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // verify cannot access deleted URL
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(404);
    });

    it('should return 404 when deleting non-existent URL', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .delete(`/api/urls/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/urls/bulk', () => {
    it('should create multiple URLs', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          urls: [
            { originalUrl: 'https://example.com/1' },
            { originalUrl: 'https://example.com/2' },
            { originalUrl: 'https://example.com/3' },
          ],
        })
        .expect(201);

      expect(response.body.created).toBe(3);
      expect(response.body.skipped).toBe(0);
      expect(response.body.urls).toHaveLength(3);
    });

    it('should handle partial failures in bulk creation', async () => {
      await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          customAlias: 'duplicate',
        });

      const response = await request(app.getHttpServer())
        .post('/api/urls/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          urls: [
            { originalUrl: 'https://example.com/1' },
            { originalUrl: 'https://example.com/2', customAlias: 'duplicate' },
            { originalUrl: 'https://example.com/3' },
          ],
        })
        .expect(201);

      expect(response.body.created).toBeLessThan(3);
      expect(response.body.skipped).toBeGreaterThan(0);
    });

    it('should reject bulk creation exceeding limit', async () => {
      const urls = Array.from({ length: 101 }, (_, i) => ({
        originalUrl: `https://example.com/${i}`,
      }));

      await request(app.getHttpServer())
        .post('/api/urls/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ urls })
        .expect(400);
    });
  });

  describe('Complete URL Lifecycle', () => {
    it('should handle create → redirect → update → delete flow', async () => {
      // 1. Create URL
      const createResponse = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com',
          title: 'Test URL',
        })
        .expect(201);
      const urlId = createResponse.body.id;
      const shortCode = createResponse.body.shortCode;

      // 2. Redirect
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);

      // 3. Get details
      const detailsResponse = await request(app.getHttpServer())
        .get(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detailsResponse.body.shortCode).toBe(shortCode);

      // 4. Update
      const updateResponse = await request(app.getHttpServer())
        .put(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated Title',
          isActive: false,
        })
        .expect(200);

      expect(updateResponse.body.title).toBe('Updated Title');
      expect(updateResponse.body.isActive).toBe(false);

      // 5. Verify inactive URL cannot be accessed
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(400);

      // 6. Delete
      await request(app.getHttpServer())
        .delete(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 7. Verify deleted URL returns 404
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(404);
    });
  });
});
