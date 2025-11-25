import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheMetricsService } from './cache-metrics.service';
import { CacheService } from './cache.service';

/* 
Cache Module - Global cache configuration
*/
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST')!,
        port: configService.get<number>('REDIS_PORT')!,
        password: configService.get<string>('REDIS_PASSWORD')!,
        db: configService.get<number>('REDIS_DB', 1)!,
        ttl: configService.get<number>('CACHE_TTL', 3600)!,
        max: 100,

        // Error handling
        socket_keepalive: true,
        socket_initial_delay: 0,
      }),
    }),
  ],
  providers: [CacheService, CacheMetricsService],
  exports: [NestCacheModule, CacheService, CacheMetricsService],
})
export class CacheModule {}
