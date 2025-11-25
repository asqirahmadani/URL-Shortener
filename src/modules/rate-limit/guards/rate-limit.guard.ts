import {
  Injectable,
  ExecutionContext,
  CanActivate,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';

import { RateLimitService } from '../rate-limit.service';

/* 
Rate Limit Guard - protect routes from abuse
*/
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    let ip = this.getClientIP(request);
    ip = this.normalizeIP(ip);

    // check blacklist first
    const isBlacklisted = await this.rateLimitService.isBlacklisted(ip);
    if (isBlacklisted) {
      throw new HttpException('IP Blocked', HttpStatus.FORBIDDEN);
    }

    // check whitelist - bypass rate limit
    const isWhitelisted = await this.rateLimitService.isWhitelisted(ip);
    if (isWhitelisted) {
      return true;
    }

    const customLimit = this.reflector.get<{ ttl: number; max: number }>(
      'rateLimit',
      context.getHandler(),
    );

    // check rate limit
    const result = await this.rateLimitService.checkRateLimit(ip, customLimit);

    // set response headers (informational)
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later',
          retryAfter: result.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getClientIP(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (forwarded as string).split(',');
      this.logger.debug(`IP from x-forwarded-for: ${ips[0].trim()}`);
      return ips[0].trim();
    }

    const realIP = request.headers['x-real-ip'];
    if (realIP) {
      this.logger.debug(`IP from x-real-ip: ${realIP}`);
      return realIP as string;
    }

    const ip = request.ip || request.socket.remoteAddress || '127.0.0.1';
    this.logger.debug(`IP from socket: ${ip}`);
    return ip;
  }

  private normalizeIP(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }

    if (ip.startsWith('::') && ip.includes('.')) {
      return ip.substring(2); // Remove '::' prefix
    }

    return ip;
  }
}
