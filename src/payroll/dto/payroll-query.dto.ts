import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class PayrollQueryDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsISO8601()
  start?: string;

  @IsOptional()
  @IsISO8601()
  end?: string;
}

export class PayrollExportQueryDto extends PayrollQueryDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}

export class LockPayrollPeriodDto {
  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;
}
