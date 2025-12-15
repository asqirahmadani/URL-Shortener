import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { User, UserRole } from '../../src/modules/auth/entities/user.entity';
import { Click } from '../../src/modules/analytics/entities/click.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { AuthService } from '../../src/modules/auth/auth.service';
import { Url } from '../../src/modules/url/entities/url.entity';
import { AuthModule } from '../../src/modules/auth/auth.module';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

describe('Authentication FLow (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let userRepository: Repository<User>;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get<string>('DB_HOST', 'localhost'),
            port: configService.get<number>('DB_PORT', 5433),
            username: configService.get<string>('DB_USERNAME', 'test'),
            password: configService.get<string>('DB_PASSWORD', 'test'),
            database: configService.get<string>('DB_DATABASE', 'test_db'),
            entities: [User, ApiKey, Url, Click],
            synchronize: true,
            dropSchema: true,
          }),
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '15m' },
        }),
        AuthModule,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await userRepository.query('TRUNCATE "users" CASCADE');
  });

  describe('User Registration Flow', () => {
    it('should register new user and return tokens', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      };

      const result = await authService.register(registerDto);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(UserRole.USER);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify user in database
      const dbUser = await userRepository.findOne({
        where: { email: 'test@example.com' },
      });

      expect(dbUser).toBeDefined();
      expect(dbUser!.password).not.toBe('Password123!'); // Should be hashed
      expect(dbUser!.isActive).toBe(true);
    });

    it('should prevent duplicate email registration', async () => {
      await authService.register({
        email: 'test@example.com',
        name: 'User 1',
        password: 'Password123!',
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          name: 'User 2',
          password: 'Password456!',
        }),
      ).rejects.toThrow('Email already registered!');

      // Verify only one user exists
      const count = await userRepository.count({
        where: { email: 'test@example.com' },
      });
      expect(count).toBe(1);
    });
  });

  describe('Login Flow', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'login@example.com',
        name: 'Login User',
        password: 'Password123!',
      });
    });

    it('should login user with correct credentials', async () => {
      const result = await authService.login({
        email: 'login@example.com',
        password: 'Password123!',
      });

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify lastLoginAt updated
      const user = await userRepository.findOne({
        where: { email: 'login@example.com' },
      });
      expect(user!.lastLoginAt).toBeDefined();
    });

    it('should reject invalid email', async () => {
      await expect(
        authService.login({
          email: 'wrong@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Email or password is wrong!');
    });

    it('should reject invalid password', async () => {
      await expect(
        authService.login({
          email: 'login@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Email or password is wrong!');
    });

    it('should reject login for inactive user', async () => {
      // Deactivate user
      await userRepository.update(
        { email: 'login@example.com' },
        { isActive: false },
      );

      await expect(
        authService.login({
          email: 'login@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Account is inactive');
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh access token with valid refresh token', async () => {
      // Register and get tokens
      const registerResult = await authService.register({
        email: 'refresh@example.com',
        name: 'Refresh User',
        password: 'Password123!',
      });

      const { refreshToken } = registerResult;

      // Add delay to ensure iat is different
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Refresh tokens
      const refreshResult = await authService.refreshAccessToken(refreshToken);

      expect(refreshResult.accessToken).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();
      expect(refreshResult.accessToken).not.toBe(registerResult.accessToken);
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshAccessToken('invalid-token'),
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('Logout Flow', () => {
    it('should clear refresh token on logout', async () => {
      const registerResult = await authService.register({
        email: 'logout@example.com',
        name: 'Logout User',
        password: 'Password123!',
      });
      const userId = registerResult.user.id;

      // Logout
      await authService.logout(userId);

      // Verify refresh token cleared
      const user = await userRepository.findOne({ where: { id: userId } });
      expect(user!.refreshToken).toBeNull();

      // Try to use old refresh token should fail
      await expect(
        authService.refreshAccessToken(registerResult.refreshToken),
      ).rejects.toThrow();
    });
  });

  describe('Complete Auth Flow', () => {
    it('should handle register -> login -> refresh -> logout', async () => {
      // 1. Register
      const registerResult = await authService.register({
        email: 'complete@example.com',
        name: 'Complete User',
        password: 'Password123!',
      });
      expect(registerResult.user).toBeDefined();
      const userId = registerResult.user.id;

      // 2. Logout (clear first session)
      await authService.logout(userId);

      // 3. Login
      const loginResult = await authService.login({
        email: 'complete@example.com',
        password: 'Password123!',
      });

      expect(loginResult.accessToken).toBeDefined();

      // 4. Refresh token
      const refreshResult = await authService.refreshAccessToken(
        loginResult.refreshToken,
      );

      expect(refreshResult.accessToken).toBeDefined();

      // 5. Final logout
      await authService.logout(userId);

      // Verify refresh token cleared
      const user = await userRepository.findOne({ where: { id: userId } });
      expect(user!.refreshToken).toBeNull();
    });
  });
});
