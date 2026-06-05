import { IsIn } from 'class-validator';
import { TenantStatus } from '../schemas/tenant.schema';

export class UpdateTenantStatusDto {
  @IsIn(Object.values(TenantStatus))
  status!: TenantStatus;
}
