import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimStringParam = ({ value }: TransformFnParams): unknown =>
  trimString(value);

const normalizeCodeParam = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateRegionDto {
  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  areaId?: string;

  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(normalizeCodeParam)
  @IsString()
  @IsNotEmpty()
  code!: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
