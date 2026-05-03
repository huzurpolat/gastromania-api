import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTimeEntryDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsDateString()
  clockOut?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  note?: string;
}
