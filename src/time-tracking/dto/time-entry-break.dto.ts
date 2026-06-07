import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class TimeEntryBreakDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  notes?: string;
}
