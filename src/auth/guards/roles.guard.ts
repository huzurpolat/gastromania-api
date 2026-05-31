import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import { hasAnyRole, isPlatformRole, normalizeRoles } from '../role-utils';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = normalizeRoles(request.user?.roles ?? []);
    if (isPlatformRole(userRoles)) {
      return true;
    }
    const hasRequiredRole = hasAnyRole(userRoles, requiredRoles);

    if (!hasRequiredRole) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    return true;
  }
}
