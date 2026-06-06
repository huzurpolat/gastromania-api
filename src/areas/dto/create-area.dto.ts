import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

const trimStringParam = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAreaDto {
  @Transform(trimStringParam)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(trimStringParam)
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
