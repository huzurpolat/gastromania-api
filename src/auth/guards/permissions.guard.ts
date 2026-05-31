import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user.roles.includes(Role.SuperAdmin)) {
      return true;
    }

    const userPermissions = new Set(user.permissions ?? []);
    const hasPermission = requiredPermissions.every(
      (permission) =>
        userPermissions.has(permission) ||
        userPermissions.has('*') ||
        userPermissions.has(`${permission.split('.')[0]}.*`),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    return true;
  }
}
