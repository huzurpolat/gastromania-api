import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { BillingStatus, LicenseStatus, TenantStatus } from '../schemas/tenant.schema';
import { TENANT_PLAN_KEYS } from '../tenant-plans';
import type { TenantPlanKey } from '../tenant-plans';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsOptional()
  @IsIn(Object.values(TenantStatus))
  status?: TenantStatus;

  @IsOptional()
  @IsIn(TENANT_PLAN_KEYS)
  planKey?: TenantPlanKey;

  @IsOptional()
  @IsIn(Object.values(LicenseStatus))
  licenseStatus?: LicenseStatus;

  @IsOptional()
  @IsIn(Object.values(BillingStatus))
  billingStatus?: BillingStatus;

  @IsOptional()
  @IsString()
  licenseValidUntil?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  billingName?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

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

  @IsString()
  @MinLength(2)
  adminFirstName!: string;

  @IsString()
  @MinLength(2)
  adminLastName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];
}
