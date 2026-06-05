import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimStringParam = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAreaDto {
  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
