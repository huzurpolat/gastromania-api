import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export type WorktimeReportGroupBy = 'employee' | 'location' | 'day';

export class WorktimeReportQueryDto {
  @IsISO8601()
  dateFrom!: string;

  @IsISO8601()
  dateTo!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsIn(['employee', 'location', 'day'])
  groupBy?: WorktimeReportGroupBy;
}
