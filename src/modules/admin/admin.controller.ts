import {
  Injectable,
  Get,
  Query,
  ParseIntPipe,
  UseGuards,
  Controller,
} from '@nestjs/common';

import { RateLimit } from '../rate-limit/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/guards/rate-limit.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/entities/user.entity';
import { AdminService } from './admin.service';

/* 
Admin Controller - admin dashboard endpoints
*/
@Controller('api/admin')
@UseGuards(RateLimitGuard, JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@RateLimit({ ttl: 60, max: 30 })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /* 
  Get system statistics
  */
  @Get('stats')
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  /* 
  Get recent activity
  */
  @Get('activity')
  async getRecentActivity(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.adminService.getRecentActivity(limit || 20);
  }

  /* 
  Health check with detailed info
  */
  @Get('health')
  async getDetailedHealt() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      // TODO: add db connection check, redis check, queue health
    };
  }
}
