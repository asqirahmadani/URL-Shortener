import { SetMetadata } from '@nestjs/common';

/* 
Custom rate limit decorator
*/
export const RateLimit = (options?: { ttl: number; max: number }) =>
  SetMetadata('rateLimit', options);
