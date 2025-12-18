import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { cleanDatabase } from './setup';

describe('Rate Limiting (E2E)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
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
  });

  describe('URL Creation Rate Limiting', () => {
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

    it('should blcok requests exceeding limit', async () => {
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
        await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);
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
        await request(app.getHttpServer())
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
          password: 'WrongPassword123!',
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
            originalUrl: 'https://example.com/${i}',
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
      await new Promise((resolve) => setTimeout(resolve, 61000));

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
