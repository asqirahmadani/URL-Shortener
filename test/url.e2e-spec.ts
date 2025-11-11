import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import request from 'supertest';

describe('URL Controller (e2e)', () => {
  let app: INestApplication;

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

  describe('/api/urls (POST)', () => {
    it('should create short URL', () => {
      return request(app.getHttpServer())
        .post('/api/urls')
        .send({
          originalUrl: 'https://example.com',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.shortCode).toBeDefined();
          expect(res.body.shortUrl).toBeDefined();
          expect(res.body.originalUrl).toBe('https://example.com');
        });
    });

    it('should create short URL dengan custom alias', () => {
      const customAlias = `test-123`;

      return request(app.getHttpServer())
        .post('/api/urls')
        .send({
          originalUrl: 'https://example.com',
          customAlias,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.shortCode).toBe(customAlias);
        });
    });

    it('should reject invalid URL', () => {
      return request(app.getHttpServer())
        .post('/api/urls')
        .send({
          originalUrl: 'not-a-url',
        })
        .expect(400);
    });

    it('should reject localhost URL', () => {
      return request(app.getHttpServer())
        .post('/api/urls')
        .send({
          originalUrl: 'http://localhost:3000',
        })
        .expect(400);
    });
  });

  describe('/:shortCode (GET)', () => {
    let shortCode: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/api/urls').send({
        originalUrl: 'https://example.com',
      });

      shortCode = res.body.shortCode;
    });

    it('should redirect to original URL', () => {
      return request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302)
        .expect('location', 'https://example.com');
    });

    it('should return 404 untuk short code tidak ada', () => {
      return request(app.getHttpServer()).get('/notexist').expect(404);
    });
  });

  describe('/api/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });
});
