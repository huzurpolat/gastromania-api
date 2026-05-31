import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DepartmentType } from '../schemas/department.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsEnum(DepartmentType)
  @IsNotEmpty()
  type!: DepartmentType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
