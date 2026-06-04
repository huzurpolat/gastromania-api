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
  color?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  icon?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  textColor?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

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

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  recipeId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetMargin?: number;

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
