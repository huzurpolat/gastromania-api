import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { StaffShiftStatus } from '../schemas/staff-shift.schema';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class CreateStaffShiftDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  regionId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  locationId!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  departmentId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  roleNeeded!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredStaffCount!: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  assignedUserIds?: string[];

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateStaffShiftDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  regionId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  departmentId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  roleNeeded?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsEnum(StaffShiftStatus)
  status?: StaffShiftStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredStaffCount?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  assignedUserIds?: string[];

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AssignStaffShiftDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds!: string[];
}

export class UnassignStaffShiftDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds!: string[];
}
