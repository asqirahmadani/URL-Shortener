import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';

import { User, UserRole } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/* 
Auth Service - Handle authentication logic
*/
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /* 
  Register new user
  */
  async register(registerDto: RegisterDto): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    const { email, password, name } = registerDto;

    // check existing user
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered!');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      email,
      name,
      password: hashedPassword,
      role: UserRole.USER,
      isEmailVerified: false, // TODO: implement email verification
      isActive: true,
    });

    await this.userRepository.save(user);
    this.logger.log(`New user registered: ${email}`);

    // generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // save refresh token
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.save(user);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /* 
  Login user
  */
  async login(loginDto: LoginDto): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    const { email, password } = loginDto;

    // find user
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email or password is wrong!');
    }

    // check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email or password is wrong!');
    }

    // update last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    this.logger.log(`User logged in: ${email}`);

    // generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // save refresh token
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.save(user);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /* 
  Refresh access token
  */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify stored refresh token
      const isTokenValid = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );
      if (!isTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // generate new tokens
      const tokens = await this.generateTokens(user);

      // update refresh token
      user.refreshToken = await bcrypt.hash(tokens.refreshToken, 10);
      await this.userRepository.save(user);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /* 
  Logout user
  */
  async logout(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      refreshToken: null,
    });

    this.logger.log(`User logged out: ${userId}`);
  }

  /* 
  Get user by id
  */
  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /* 
  Generate JWT tokens
  */
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /* 
  Validate user for JWT strategy
  */
  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
