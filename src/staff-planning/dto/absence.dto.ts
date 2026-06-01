import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { StaffAbsenceType } from '../schemas/staff-absence.schema';

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

  @IsEnum(StaffAbsenceType)
  type!: StaffAbsenceType;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
