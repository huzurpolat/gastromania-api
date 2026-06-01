import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  CourseType,
  OrderItemStatus,
  ProductionArea,
} from '../schemas/order.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

const stringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

export class OrderItemDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  productId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  isKitchenItem?: boolean;

  @IsOptional()
  @IsEnum(OrderItemStatus)
  status?: OrderItemStatus;

  @IsOptional()
  @IsEnum(ProductionArea)
  productionArea?: ProductionArea;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @Transform(({ value }) => stringArray(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialRequests?: string[];

  @Transform(({ value }) => stringArray(value))
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  comment?: string;
}
