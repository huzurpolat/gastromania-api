import { createParamDecorator } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../types/authenticated-request.type';

export const CurrentUser = createParamDecorator<
  keyof AuthenticatedUser | undefined,
  AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser]
>((data, ctx) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

  return data ? request.user[data] : request.user;
});
