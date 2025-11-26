import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../entities/user.entity';

/* 
Roles Decorator - specify required roles for route
*/
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
