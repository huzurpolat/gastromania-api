import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMenuItemDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  category!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  ingredients?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  weight?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isKitchenItem?: boolean;

  @IsOptional()
  @IsBoolean()
  isVegan?: boolean;

  @IsOptional()
  @IsBoolean()
  containsNuts?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
