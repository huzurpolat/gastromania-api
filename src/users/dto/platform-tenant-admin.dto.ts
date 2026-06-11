import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlatformTenantAdminDto {
  @Transform(({ value }) => {
    const trimmedValue = trimString(value);
    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  firstName!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  lastName!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdatePlatformTenantAdminDto {
  @Transform(({ value }) => {
    const trimmedValue = trimString(value);
    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  firstName?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  lastName?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  phone?: string;
}

export class PlatformTenantAdminPasswordResetDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class PlatformTenantAdminStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}
