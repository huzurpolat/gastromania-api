import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const optionalTrim = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export class CreateShiftSwapRequestDto {
  @IsString()
  shiftId!: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @Transform(({ value }) => optionalTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
