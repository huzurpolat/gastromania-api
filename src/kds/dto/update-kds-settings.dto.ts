import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CourseType, ProductionArea } from '../../orders/schemas/order.schema';

class UpdateSlaSettingsDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  [CourseType.Drink]?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  [CourseType.Starter]?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  [CourseType.Main]?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  [CourseType.Dessert]?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  [CourseType.Other]?: number;
}

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : undefined;

export class UpdateKdsSettingsDto {
  @IsOptional()
  @IsArray()
  @IsEnum(ProductionArea, { each: true })
  productionAreas?: ProductionArea[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateSlaSettingsDto)
  slaMinutes?: Partial<Record<CourseType, number>>;

  @IsOptional()
  @IsBoolean()
  automaticPickupNumbers?: boolean;

  @IsOptional()
  @IsBoolean()
  resetPickupNumbersDaily?: boolean;

  @IsOptional()
  @IsBoolean()
  soundOnNewOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  soundOnReady?: boolean;

  @IsOptional()
  @IsBoolean()
  autoRefresh?: boolean;

  @Transform(({ value }) => stringArray(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleColumns?: string[];

  @IsOptional()
  @IsString()
  defaultAreaFilter?: string;
}
