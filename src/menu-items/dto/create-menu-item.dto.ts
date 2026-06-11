import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class MenuItemExtraInventoryImpactDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  stockItemId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  stockItemName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  quantity!: number;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  unit!: string;
}

export class MenuItemExtraDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  id?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  priceDelta?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  sendToKitchen?: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemExtraInventoryImpactDto)
  inventoryImpact?: MenuItemExtraInventoryImpactDto[];
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemExtraDto)
  extras?: MenuItemExtraDto[];
}
