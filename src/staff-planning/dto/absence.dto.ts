import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import {
  StaffAbsenceStatus,
  StaffAbsenceType,
} from '../schemas/staff-absence.schema';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class CreateAbsenceDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  userId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsEnum(StaffAbsenceType)
  type!: StaffAbsenceType;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewAbsenceDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  managerNote?: string;
}

export class AbsenceFiltersDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  userId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(StaffAbsenceType)
  type?: StaffAbsenceType;

  @IsOptional()
  @IsEnum(StaffAbsenceStatus)
  status?: StaffAbsenceStatus;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
