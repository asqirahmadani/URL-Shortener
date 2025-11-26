import { SetMetadata } from '@nestjs/common';

/* 
Public Decorator - mark route as public (no auth required)
*/
export const Public = () => SetMetadata('isPublic', true);
