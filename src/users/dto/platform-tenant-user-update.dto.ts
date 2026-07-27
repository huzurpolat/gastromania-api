import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  USER_LOCATION_ASSIGNMENT_ROLE_INPUTS,
} from './create-user.dto';

export const platformTenantUserStatuses = [
  'active',
  'suspended',
  'inactive',
  'disabled',
] as const;

export type PlatformTenantUserUpdateStatus =
  (typeof platformTenantUserStatuses)[number];

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lowerEmail = (value: unknown): unknown => {
  const trimmedValue = trimString(value);
  return typeof trimmedValue === 'string'
    ? trimmedValue.toLowerCase()
    : trimmedValue;
};

export class PlatformTenantUserLocationAssignmentUpdateDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  locationId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsIn(USER_LOCATION_ASSIGNMENT_ROLE_INPUTS)
  role!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdatePlatformTenantUserDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  name?: string;

  @Transform(({ value }) => lowerEmail(value))
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsIn(platformTenantUserStatuses)
  status?: PlatformTenantUserUpdateStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlatformTenantUserLocationAssignmentUpdateDto)
  locationAssignments?: PlatformTenantUserLocationAssignmentUpdateDto[];

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  departmentId?: string;
}
