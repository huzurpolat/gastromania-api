import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const valueOrUndefined = trimString(value);
  return valueOrUndefined === '' ? undefined : valueOrUndefined;
};

export class GenerateDailyClosingDto {
  @IsMongoId()
  locationId!: string;

  @IsDateString()
  businessDate!: string;
}

export class UpdateDailyClosingDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  countedCash?: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  differenceNote?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  issueNote?: string;
}

export class CompleteDailyClosingDto extends UpdateDailyClosingDto {}

export class ReopenDailyClosingDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class LockDailyClosingDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
