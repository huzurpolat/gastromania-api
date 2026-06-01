import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { ProductionArea } from '../../orders/schemas/order.schema';
import { RecipeType } from '../schemas/recipe.schema';

export class RecipeNutritionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  calories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fat?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saturatedFat?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sugar?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  protein?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salt?: number;
}

export class RecipeIngredientDto {
  @IsString()
  stockItemId!: string;

  @IsString()
  stockItemName!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wasteFactor?: number;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePriceNet?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additives?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RecipeNutritionDto)
  nutrition?: RecipeNutritionDto;
}

export class RecipeVariantDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];
}

export class RecipeOptionDto extends RecipeVariantDto {}

export class RecipeComponentDto {
  @IsString()
  recipeId!: string;

  @IsString()
  recipeName!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class RecipeStepDto {
  @IsNumber()
  @Min(1)
  position!: number;

  @IsString()
  title!: string;

  @IsString()
  instruction!: string;

  @IsOptional()
  @IsString()
  haccpNote?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}

export class CreateRecipeDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  recipeNumber?: string;

  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsEnum(RecipeType)
  type!: RecipeType;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  visibleInSales?: boolean;

  @IsOptional()
  @IsEnum(ProductionArea)
  productionArea?: ProductionArea;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preparationTimeMinutes?: number;

  @IsOptional()
  @IsString()
  portionSize?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  basePortions?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients!: RecipeIngredientDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeVariantDto)
  variants?: RecipeVariantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeOptionDto)
  options?: RecipeOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentDto)
  components?: RecipeComponentDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualAllergens?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualAdditives?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeStepDto)
  steps?: RecipeStepDto[];
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}
