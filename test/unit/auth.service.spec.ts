import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';

import { User, UserRole } from '../../src/modules/auth/entities/user.entity';
import { AuthService } from '../../src/modules/auth/auth.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Password123!',
      };

      const mockUser = {
        id: 'uuid',
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.USER,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.register(registerDto);

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        name: 'Test User',
        password: 'Password123!',
      };

      mockUserRepository.findOne.mockResolvedValue({
        email: 'existing@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockUser = {
        id: 'uuid',
        email: 'test@example.com',
        password: 'hashed-password',
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(loginDto);

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      const loginDto = {
        email: 'wrong@example.com',
        password: 'Password123!',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const mockUser = {
        email: 'test@example.com',
        password: 'hashed-password',
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockUser = {
        email: 'test@example.com',
        password: 'hashed-password',
        isActive: false,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockUser = {
        id: 'uuid',
        email: 'test@example.com',
        refreshToken: 'hashed-refresh-token',
      };

      mockJwtService.verify.mockReturnValue({ sub: 'uuid' });
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('new-token');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-token');
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await service.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should logout user by clearing refresh token', async () => {
      mockUserRepository.update.mockResolvedValue({});

      await service.logout('user-id');

      expect(mockUserRepository.update).toHaveBeenCalledWith('user-id', {
        refreshToken: null,
      });
    });
  });

  describe('validateUser', () => {
    it('should return user if active', async () => {
      const mockUser = {
        id: 'uuid',
        email: 'test@example.com',
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('uuid');

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.validateUser('invalid-id')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user inactive', async () => {
      const mockUser = {
        id: 'uuid',
        isActive: false,
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.validateUser('uuid')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
