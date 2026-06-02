import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderStatus } from '../../orders/schemas/order.schema';

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class UpdateCounterStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  reason?: string;
}
