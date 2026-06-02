import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value;

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class UpdateCounterSettingsDto {
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{1,3}$/)
  pickupPrefix?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  pickupStartNumber?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  pickupNumberLength?: number;

  @IsOptional()
  @IsBoolean()
  dailyResetEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePaymentBeforeComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  receiptPrinterEnabled?: boolean;

  @Transform(({ value }: TransformFnParams): unknown =>
    optionalTrimString(value),
  )
  @IsOptional()
  @IsString()
  receiptFooter?: string;
}
