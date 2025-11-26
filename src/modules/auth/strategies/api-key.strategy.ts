import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Request } from 'express';
import bcrypt from 'bcrypt';

import { ApiKey } from '../entities/api-key.entity';

/* 
API Key Strategy - validate API keys
*/
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(req: Request): Promise<any> {
    // extract API key from header
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    // find API key in database
    const apiKeys = await this.apiKeyRepository.find({
      where: { isActive: true },
      relations: ['user'],
    });

    // check each hashed key
    let validKey: ApiKey | null = null;
    for (const key of apiKeys) {
      const isValid = await bcrypt.compare(apiKey, key.key);
      if (isValid) {
        validKey = key;
        break;
      }
    }

    if (!validKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    // check expiration
    if (validKey.expiresAt && new Date() > validKey.expiresAt) {
      throw new UnauthorizedException('API key expired');
    }

    // update last used
    validKey.lastUsedAt = new Date();
    await this.apiKeyRepository.save(validKey);

    // return user object with API key permissions
    return {
      id: validKey.user.id,
      email: validKey.user.email,
      role: validKey.user.role,
      apiKeyId: validKey.id,
      permissions: validKey.permissions,
    };
  }
}
