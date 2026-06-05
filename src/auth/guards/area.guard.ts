import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessPolicyService } from '../../access/access-policy.service';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

type RequestWithArea = Request & {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
};

@Injectable()
export class AreaGuard implements CanActivate {
  constructor(private readonly accessPolicy: AccessPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Kein Benutzerkontext vorhanden');
    }

    const areaId = this.getAreaId(request as RequestWithArea);

    if (!areaId) {
      return true;
    }

    if (!(await this.accessPolicy.canAccessArea(user, areaId))) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
    }

    return true;
  }

  private getAreaId(request: RequestWithArea): string | undefined {
    const bodyAreaId = request.body?.areaId;
    const queryAreaId = request.query.areaId;

    return (
      request.params.areaId ??
      request.params.id ??
      (typeof queryAreaId === 'string' ? queryAreaId : undefined) ??
      (typeof bodyAreaId === 'string' ? bodyAreaId : undefined)
    );
  }
}
