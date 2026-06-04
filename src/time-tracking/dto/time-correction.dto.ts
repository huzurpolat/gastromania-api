import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTimeCorrectionDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  timeEntryId!: string;

  @IsOptional()
  @IsDateString()
  requestedClockIn?: string;

  @IsOptional()
  @IsDateString()
  requestedClockOut?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  requestedBreakMinutes?: number;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
