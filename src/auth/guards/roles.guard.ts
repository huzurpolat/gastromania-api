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

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = normalizeRoles(request.user?.roles ?? []);
    if (isPlatformRole(userRoles)) {
      if (this.isPlatformRequest(request)) {
        return true;
      }

      throw new ForbiddenException(
        'Platform Admins duerfen nur Plattform-Endpunkte verwenden',
      );
    }

    if (!requiredRoles?.length) {
      return true;
    }

    const hasRequiredRole = hasAnyRole(userRoles, requiredRoles);

    if (!hasRequiredRole) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    return true;
  }

  private isPlatformRequest(request: AuthenticatedRequest): boolean {
    const rawUrl =
      (request as AuthenticatedRequest & { originalUrl?: string; url?: string })
        .originalUrl ??
      (request as AuthenticatedRequest & { url?: string }).url ??
      '';
    const path = rawUrl.split('?')[0] ?? '';

    return (
      path === '/platform' ||
      path.startsWith('/platform/') ||
      path === '/api/platform' ||
      path.startsWith('/api/platform/')
    );
  }
}
