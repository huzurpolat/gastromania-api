import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DepartmentType } from '../schemas/department.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsOptional()
  tenantId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsOptional()
  companyId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsOptional()
  locationId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsEnum(DepartmentType)
  @IsOptional()
  type?: DepartmentType;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDepartmentStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
