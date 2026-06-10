import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { BillingStatus } from '../schemas/tenant.schema';
import { TENANT_PLAN_KEYS } from '../tenant-plans';
import type { TenantPlanKey } from '../tenant-plans';

export class UpdateTenantBillingDto {
  @IsOptional()
  @IsIn(TENANT_PLAN_KEYS)
  planKey?: TenantPlanKey;

  @IsOptional()
  @IsIn(Object.values(BillingStatus))
  billingStatus?: BillingStatus;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  billingNotes?: string;

  @IsOptional()
  @IsString()
  contractStartDate?: string;

  @IsOptional()
  @IsString()
  contractEndDate?: string;
}
