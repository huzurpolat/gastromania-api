import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isPlatformRole } from '../role-utils';
import { AuthenticatedRequest } from '../types/authenticated-request.type';
import {
  Tenant,
  TenantDocument,
  TenantStatus,
} from '../../tenants/schemas/tenant.schema';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Kein Benutzerkontext vorhanden');
    }

    if (isPlatformRole(user.roles)) {
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    const tenant = await this.tenantModel
      .findById(user.tenantId)
      .select('status')
      .lean()
      .exec();

    if (
      tenant &&
      ![TenantStatus.Active, TenantStatus.Trial].includes(tenant.status)
    ) {
      throw new ForbiddenException('Tenant ist gesperrt oder gekuendigt');
    }

    return true;
  }
}
