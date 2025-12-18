import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { cleanDatabase } from './setup';

describe('QR Code Generation (E2E)', () => {
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

  beforeEach(async () => {
    await cleanDatabase();

    // register user and create URL
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'qrcode@example.com',
        name: 'QR Code User',
        password: 'Password123!',
      });

    accessToken = registerResponse.body.accessToken;

    const createResponse = await request(app.getHttpServer())
      .post('/api/urls')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originalUrl: 'https://example.com',
      });

    shortCode = createResponse.body.shortCode;
  });

  describe('GET /api/qrcode/:shortCode.png', () => {
    it('should generate PNG QR code', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toContain('public');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should generate PNG with custom size', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png?size=500`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
    });

    it('should generate PNG with custom colors', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png?dark=FF0000&light=FFFFFF`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toBeInstanceOf(Buffer);
    });

    it('should reject invalid size (too small)', async () => {
      await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png?size=50`)
        .expect(400);
    });

    it('should reject invalid size (too large)', async () => {
      await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png?size=3000`)
        .expect(400);
    });

    it('should handle non-existent short code', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/qrcode/nonexistent.png')
        .expect(200);

      // QR code is generated regardless, but points to invalid URL
      expect(response.body).toBeInstanceOf(Buffer);
    });
  });

  describe('GET /api/qrcode/:shortCode.svg', () => {
    it('should generate SVG QR code', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.svg`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/svg+xml');
      expect(response.headers['cache-control']).toContain('public');
      expect(response.text).toContain('<svg');
      expect(response.text).toContain('</svg>');
    });

    it('should generate SVG with custom size', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.svg?size=400`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/svg+xml');
      expect(response.text).toContain('<svg');
    });

    it('should generate SVG with custom colors', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.svg?dark=0000FF&light=FFFF00`)
        .expect(200);

      expect(response.text).toContain('<svg');
    });
  });

  describe('GET /api/qrcode/:shortCode', () => {
    it('should return QR code as Data URL', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}`)
        .expect(200);

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('shortCode', shortCode);
      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it('should return Data URL with custom size', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}?size=300`)
        .expect(200);

      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it('should return Data URL with custom colors', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}?dark=000000&light=FFFFFF`)
        .expect(200);

      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('QR Code Caching', () => {
    it('should cache QR code responses', async () => {
      // first request
      const response1 = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png`)
        .expect(200);

      // second request (should be cached)
      const response2 = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png`)
        .expect(200);

      // verify cache headers
      expect(response2.headers['cache-control']).toBeDefined();
      expect(response2.headers['cache-control']).toContain('public');

      // both should return valid images
      expect(response1.body).toBeInstanceOf(Buffer);
      expect(response2.body).toBeInstanceOf(Buffer);
    });
  });

  describe('QR Code with Different Parameters', () => {
    it('should generate different QR codes for different URLs', async () => {
      // create second URL
      const createResponse2 = await request(app.getHttpServer())
        .post('/api/urls')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          originalUrl: 'https://another-example.com',
        });

      const shortCode2 = createResponse2.body.shortCode;

      // get QR codes
      const response1 = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode}.png`)
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get(`/api/qrcode/${shortCode2}.png`)
        .expect(200);

      // QR codes should be different
      expect(response1.body).not.toEqual(response2.body);
    });
  });
});
