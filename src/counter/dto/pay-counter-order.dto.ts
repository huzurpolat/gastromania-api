import { Transform, Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../../orders/schemas/order.schema';

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class PayCounterOrderDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  note?: string;
}
