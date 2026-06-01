import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TableStatus } from '../schemas/table.schema';

const optionalTrimString = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue ? trimmedValue : undefined;
};

export class UpdateTableStatusDto {
  @IsEnum(TableStatus)
  status!: TableStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  guestCount?: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  assignedWaiterId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  reservationId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
