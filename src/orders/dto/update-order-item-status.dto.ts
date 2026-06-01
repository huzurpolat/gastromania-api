import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderItemStatus } from '../schemas/order.schema';

const STATUS_ALIASES: Record<string, OrderItemStatus> = {
  open: OrderItemStatus.Open,
  started: OrderItemStatus.Started,
  in_preparation: OrderItemStatus.Preparing,
  ready: OrderItemStatus.Ready,
  served: OrderItemStatus.Served,
  cancelled: OrderItemStatus.Cancelled,
};

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

const normalizeStatus = (value: unknown): unknown => {
  const trimmedValue = optionalTrimString(value);

  if (typeof trimmedValue !== 'string') {
    return trimmedValue;
  }

  return STATUS_ALIASES[trimmedValue] ?? trimmedValue;
};

export class UpdateOrderItemStatusDto {
  @Transform(({ value }) => normalizeStatus(value))
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

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  note?: string;
}
