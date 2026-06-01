import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class CreateAvailabilityDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  userId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @Matches(/^\d{2}:\d{2}$/)
  availableFrom!: string;

  @Matches(/^\d{2}:\d{2}$/)
  availableTo!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateAvailabilityDto extends CreateAvailabilityDto {}
