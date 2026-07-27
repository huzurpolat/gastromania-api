import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StaffAvailabilityType } from '../schemas/staff-availability.schema';

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

  @IsOptional()
  @IsEnum(StaffAvailabilityType)
  type?: StaffAvailabilityType;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  availableFrom?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  availableTo?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateAvailabilityDto extends CreateAvailabilityDto {}
