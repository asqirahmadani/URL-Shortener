import { Injectable, Logger } from '@nestjs/common';

/* 
Cache Metrics - Monitor cache hit/miss rate
*/
@Injectable()
export class CacheMetricsService {
  private readonly logger = new Logger(CacheMetricsService.name);
  private hits = 0;
  private misses = 0;
  private lastReset = Date.now();

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : (this.hits / total) * 100;
  }

  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    uptime: number;
  } {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(this.getHitRate() * 100) / 100,
      uptime: Date.now() - this.lastReset,
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.lastReset = Date.now();
    this.logger.log('Cache metrics reset');
  }

  logStats(): void {
    const stats = this.getStats();
    this.logger.log(
      `Cache Stats - Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${stats.hitRate}%`,
    );
  }
}
