import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateManagedRoleDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateManagedRoleDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
