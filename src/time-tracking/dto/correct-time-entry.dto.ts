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

export class CorrectTimeEntryDto {
  @IsOptional()
  @IsDateString()
  clockInAt?: string;

  @IsOptional()
  @IsDateString()
  clockOutAt?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  correctionReason!: string;
}
