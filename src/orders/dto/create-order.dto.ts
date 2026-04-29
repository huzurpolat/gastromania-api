import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';
import { OrderItemDto } from './order-item.dto';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class CreateOrderDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  tableId!: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  notes?: string;
}
