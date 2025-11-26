import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/* 
Current User Decorator - extract user from request
*/
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
