import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  OrderItemStatus,
  OrderStatus,
} from '../../orders/schemas/order.schema';

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  employeeName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateOrderItemStatusDto {
  @IsEnum(OrderItemStatus)
  status!: OrderItemStatus;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  employeeName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  comment?: string;
}

export class KdsActionDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  employeeName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  comment?: string;
}
