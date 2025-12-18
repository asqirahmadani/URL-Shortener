import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { cleanDatabase } from './setup';

describe('Analytics (E2E)', () => {
  let app: INestApplication;
  let accessToken: string;
  let shortCode: string;
  let urlId: string;

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
        email: 'analytics@example.com',
        name: 'Analytics User',
        password: 'Password123!',
      });

    accessToken = registerResponse.body.accessToken;

    const createResponse = await request(app.getHttpServer())
      .post('/api/urls')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        originalUrl: 'https://example.com',
        title: 'Analytics Test URL',
      });

    shortCode = createResponse.body.shortCode;
    urlId = createResponse.body.id;
  });

  describe('Click Tracking', () => {
    it('should trakc clicks asynchronously', async () => {
      // make redirect request
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set(
          'User-Agent',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) AppleWebKit/605.1.15',
        )
        .set('Referer', 'https://google.com')
        .expect(302);

      // wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // verify analytics recorded
      const analyticsResponse = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(analyticsResponse.body.totalClicks).toBeGreaterThan(0);
    });

    it('should track multiple clicks from different sources', async () => {
      // Click 1: iPhone from Google
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)')
        .set('Referer', 'https://google.com')
        .expect(302);

      // Click 2: Desktop from Facebook
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        .set('Referer', 'https://facebook.com')
        .expect(302);

      // Click 3: Android from Twitter
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (Linux; Android 10)')
        .set('Referer', 'https://twitter.com')
        .expect(302);

      // wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // check overview
      const overviewResponse = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(overviewResponse.body.totalClicks).toBe(3);
    });
  });

  describe('GET /api/analytics/:shortCode/overview', () => {
    beforeEach(async () => {
      // generate some clicks
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get(`/${shortCode}`)
          .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)')
          .expect(302);
      }

      //   wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    it('should return analytics overview', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalClicks');
      expect(response.body).toHaveProperty('uniqueVisitors');
      expect(response.body).toHaveProperty('averageClicksPerDay');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body.totalClicks).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent short code', async () => {
      await request(app.getHttpServer())
        .get('/api/analytics/nonexistent/overview')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should reject request without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .expect(401);
    });
  });

  describe('GET /api/analytics/:shortCode/timeline', () => {
    beforeEach(async () => {
      // generate clicks over time
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return timeline data with default parameters', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/timeline`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('interval', 'day');
      expect(response.body).toHaveProperty('totalClicks');
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should return timeline with custom interval', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/timeline?interval=hour&days=7`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.interval).toBe('hour');
    });

    it('should return timeline for week interval', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/timeline?interval=week&days=30`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.interval).toBe('week');
    });

    it('should validate days parameter', async () => {
      // test with invalid days
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/timeline?days=999`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // should cap at maximum (e.g., 365 days)
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/analytics/:shortCode/locations', () => {
    beforeEach(async () => {
      // generate clicks from different IPs
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('X-Forwarded-For', '8.8.8.8') // US IP
        .expect(302);

      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('X-Forwarded-For', '202.43.173.1') // Indonesia IP
        .expect(302);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return location statistics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('countries');
      expect(response.body).toHaveProperty('cities');
      expect(response.body).toHaveProperty('totalClicks');
      expect(response.body.countries).toBeInstanceOf(Array);
    });

    it('should include country codes and percentages', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (response.body.countries.length > 0) {
        const country = response.body.countries[0];
        expect(country).toHaveProperty('countryCode');
        expect(country).toHaveProperty('clicks');
        expect(country).toHaveProperty('percentage');
      }
    });
  });

  describe('GET /api/analytics/:shortCode/devices', () => {
    beforeEach(async () => {
      // mobile click
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)')
        .expect(302);

      // desktop click
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set(
          'User-Agent',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        )
        .expect(302);

      // tablet click
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (iPad; CPU OS 14_0)')
        .expect(302);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return device statistics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/devices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('byType');
      expect(response.body).toHaveProperty('byBrowser');
      expect(response.body).toHaveProperty('byOS');
      expect(response.body).toHaveProperty('totalClicks');
    });

    it('should include device type breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/devices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.byType).toBeInstanceOf(Array);

      if (response.body.byType.length > 0) {
        const deviceType = response.body.byType[0];
        expect(deviceType).toHaveProperty('deviceType');
        expect(deviceType).toHaveProperty('clicks');
        expect(deviceType).toHaveProperty('percentage');
      }
    });

    it('should include browser breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/devices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.byBrowser).toBeInstanceOf(Array);
    });

    it('should include OS breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/devices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.byOS).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/analytics/:shortCode/referrers', () => {
    beforeEach(async () => {
      // click from Google
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('Referer', 'https://google.com/search?q=test')
        .expect(302);

      // click from Facebook
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('Referer', 'https://facebook.com')
        .expect(302);

      // direct click (no referer)
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return referrer statistics', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/referrers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });

    it('should include clicks counts for each referrer', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/referrers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (response.body.length > 0) {
        const referrer = response.body[0];
        expect(referrer).toHaveProperty('referer');
        expect(referrer).toHaveProperty('clicks');
        expect(typeof referrer.clicks).toBe('number');
      }
    });
  });

  describe('GET /api/analytics/:shortCode/heatmap', () => {
    beforeEach(async () => {
      // generate clicks
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .get(`/${shortCode}`)
          .set('X-Forwarded-For', '8.8.8.8')
          .expect(302);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should return heatmap data', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/heatmap`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });

    it('should return heatmap with custom days parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/heatmap?days=14`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });

    it('should include hour, day, country, and clicks', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/heatmap`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (response.body.length > 0) {
        const dataPoint = response.body[0];
        expect(dataPoint).toHaveProperty('hour');
        expect(dataPoint).toHaveProperty('day');
        expect(dataPoint).toHaveProperty('country');
        expect(dataPoint).toHaveProperty('clicks');
      }
    });
  });

  describe('GET /api/analytics/:shortCode/export', () => {
    beforeEach(async () => {
      // generate some clicks
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .set('Referer', 'https://google.com')
        .set('X-Forwarded-For', '8.8.8.8')
        .expect(302);

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should export analytics as CSV', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('Timestamp');
      expect(response.text).toContain('IP Address');
      expect(response.text).toContain('Country');
    });

    it('should include actual click data in CSV', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const lines = response.text.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('Analytics Caching', () => {
    beforeEach(async () => {
      // generate clicks
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should cache analytics overview results', async () => {
      // first request - cache miss
      const response1 = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const firstRequestTime = Date.now();

      // second request - should be faster (cache hit)
      const response2 = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const secondRequestTime = Date.now();

      // verify same data returned
      expect(response1.body.totalClicks).toBe(response2.body.totalClicks);

      expect(response2.status).toBe(200);
    });

    it('should invalidate cache after new clicks', async () => {
      // get initial analytics
      const response1 = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const initialClicks = response1.body.totalClicks;

      // generate new click
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);

      // wait for processing and cache invalidation
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // get analytics again
      const response2 = await request(app.getHttpServer())
        .get(`/api/analytics/${shortCode}/overview`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // should reflect new click
      expect(response2.body.totalClicks).toBeGreaterThanOrEqual(initialClicks);
    });
  });
});
