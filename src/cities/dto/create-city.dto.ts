import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const trimStringParam = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimStringParam = ({ value }: TransformFnParams): unknown => {
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' ? undefined : trimmed;
};

export class CreateCityDto {
  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  areaId!: string;

  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  regionId!: string;

  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @Transform(optionalTrimStringParam)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(optionalTrimStringParam)
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
