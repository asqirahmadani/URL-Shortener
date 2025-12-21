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

import { RateLimitGuard } from '../../src/modules/rate-limit/guards/rate-limit.guard';
import { cleanDatabase } from './setup';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('Authentication Flow (E2E)', () => {
  let app: INestApplication;

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
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

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
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.name).toBe('Test User');
      expect(response.body.user.role).toBe('user');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject registration with duplicate email', async () => {
      const registerDto = {
        email: 'duplicate@example.com',
        name: 'User 1',
        password: 'Password123!',
      };

      // First registration
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerDto)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(registerDto)
        .expect(409);

      expect(response.body.message).toContain('already registered');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          name: 'Test User',
          password: 'Password123!',
        })
        .expect(400);

      expect(response.body.message).toContain('Email is invalid');
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'weak',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'Password minimal has 8 characters',
      );
    });

    it('should reject registration without uppercase in password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123!',
        })
        .expect(400);

      expect(response.body.message).toContain(
        'Password must contain uppercase, lowercase letters, and numbers/symbols',
      );
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          // missing name and password
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should reject registration with extra fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          password: 'Password123!',
          extraField: 'should be rejected',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    const userCredentials = {
      email: 'login@example.com',
      name: 'Login User',
      password: 'Password123!',
    };

    beforeEach(async () => {
      // Register user before each login test
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(userCredentials);
    });

    it('should login successfully with correct credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(userCredentials.email);
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: userCredentials.password,
        })
        .expect(401);

      expect(response.body.message).toContain('Email or password is wrong');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.message).toContain('Email or password is wrong');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          // missing password
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'refresh@example.com',
          name: 'Refresh User',
          password: 'Password123!',
        });

      refreshToken = registerResponse.body.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.message).toContain('Invalid refresh token');
    });

    it('should reject expired refresh token', async () => {
      // This test would require mocking time or using a token with very short expiry
      // For now, we test with completely invalid token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired';

      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.message).toContain('Invalid refresh token');
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'me@example.com',
          name: 'Me User',
          password: 'Password123!',
        });

      accessToken = registerResponse.body.accessToken;
      userId = registerResponse.body.user.id;
    });

    it('should get current user profiles with valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', userId);
      expect(response.body).toHaveProperty('email', 'me@example.com');
      expect(response.body).toHaveProperty('name', 'Me User');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('should reject request with malformed authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'logout@example.com',
          name: 'Logout User',
          password: 'Password123!',
        });

      accessToken = registerResponse.body.accessToken;
      refreshToken = registerResponse.body.refreshToken;
    });

    it('should logout successfully', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Try to use refresh token after logout (should fail)
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.message).toContain('Invalid refresh token');
    });

    it('should reject logout without token', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should handle register → login → get profile → logout flow', async () => {
      // 1. Register
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'complete@example.com',
          name: 'Complete User',
          password: 'Password123!',
        })
        .expect(201);

      expect(registerResponse.body.accessToken).toBeDefined();
      const userId = registerResponse.body.user.id;

      // 2. Logout (clear first session)
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
        .expect(204);

      // 3. Login
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'complete@example.com',
          password: 'Password123!',
        })
        .expect(200);

      const accessToken = loginResponse.body.accessToken;

      // 4. Get Profile
      const profileResponse = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileResponse.body.id).toBe(userId);

      // 5. Refresh Token
      const refreshResponse = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(200);

      expect(refreshResponse.body.accessToken).toBeDefined();

      // 6. Final Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // 7. Verify cannot access still valid (JWT stateless)
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 8. Verify cannot access refreshToken after logout
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(401);
    });
  });
});
