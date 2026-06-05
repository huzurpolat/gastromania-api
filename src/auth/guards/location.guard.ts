import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessPolicyService } from '../../access/access-policy.service';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

type RequestWithLocation = Request & {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  body?: Record<string, unknown>;
};

@Injectable()
export class LocationGuard implements CanActivate {
  constructor(private readonly accessPolicy: AccessPolicyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Kein Benutzerkontext vorhanden');
    }

    const locationId = this.getLocationId(request as RequestWithLocation);

    if (!locationId) {
      return true;
    }

    await this.accessPolicy.assertCanAccessLocation(user, locationId);

    return true;
  }

  private getLocationId(request: RequestWithLocation): string | undefined {
    const bodyLocationId = request.body?.locationId;
    const queryLocationId = request.query.locationId;

    return (
      request.params.locationId ??
      request.params.id ??
      (typeof queryLocationId === 'string' ? queryLocationId : undefined) ??
      (typeof bodyLocationId === 'string' ? bodyLocationId : undefined)
    );
  }
}
