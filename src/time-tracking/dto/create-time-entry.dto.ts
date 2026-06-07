import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTimeEntryDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  employeeId?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  shiftId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  note?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ClockOutTimeEntryDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  timeEntryId?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  notes?: string;
}
