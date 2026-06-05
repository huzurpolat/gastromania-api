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
  @IsString()
  planKey?: string;

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
