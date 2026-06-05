import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessPolicyService } from '../../access/access-policy.service';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

type RequestWithRegion = Request & {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
};

@Injectable()
export class RegionGuard implements CanActivate {
  constructor(private readonly accessPolicy: AccessPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Kein Benutzerkontext vorhanden');
    }

    const regionId = this.getRegionId(request as RequestWithRegion);

    if (!regionId) {
      return true;
    }

    if (!(await this.accessPolicy.canAccessRegion(user, regionId))) {
      throw new ForbiddenException('Keine Berechtigung fuer diese Region');
    }

    return true;
  }

  private getRegionId(request: RequestWithRegion): string | undefined {
    const bodyRegionId = request.body?.regionId;
    const queryRegionId = request.query.regionId;

    return (
      request.params.regionId ??
      request.params.id ??
      (typeof queryRegionId === 'string' ? queryRegionId : undefined) ??
      (typeof bodyRegionId === 'string' ? bodyRegionId : undefined)
    );
  }
}
