import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class OrderItemDto {
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
}
