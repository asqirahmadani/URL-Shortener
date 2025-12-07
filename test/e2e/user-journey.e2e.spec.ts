import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('User Journey (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let shortCode: string;

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

  describe('Complete user journey', () => {
    it('1. Register new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `test-${Date.now()}@example.com`,
          name: 'Test User',
          password: 'SecurePass123!',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');

      accessToken = response.body.accessToken;
    });

    it('2. Create short URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://example.com/very/long/url',
          title: 'Test URL',
        })
        .expect(201);

      expect(response.body).toHaveProperty('shortCode');
      expect(response.body.originalUrl).toBe(
        'https://example.com/very/long/url',
      );

      shortCode = response.body.shortCode;
    });

    it('3. Get URL details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/urls/${shortCode}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.shortCode).toBe(shortCode);
      expect(response.body.clickCount).toBe(0);
    });

    it('4. Redirect via short URL', async () => {
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302)
        .expect('Location', 'https://example.com/very/long/url');
    });

    it('5. Generate QR code', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png`)
        .expect(200)
        .expect('Content-Type', /image\/png/);

      expect(response.body).toBeInstanceOf(Buffer);
    });

    it('6. Check analytics (after click)', async () => {
      // Wait for async click processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.totalClicks).toBeGreaterThan(0);
    });

    it('7. List user URLs', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/urls?page=1&limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.urls).toBeInstanceOf(Array);
      expect(response.body.urls.length).toBeGreaterThan(0);
    });

    it('8. Update URL', async () => {
      // Get URL ID first
      const listResponse = await request(app.getHttpServer())
        .get('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`);

      const urlId = listResponse.body.urls[0].id;

      await request(app.getHttpServer())
        .put(`/api/urls/${urlId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated Title',
        })
        .expect(200);
    });

    it('9. Logout', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('10. Access after logout should fail', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });
});
