import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TableStatus } from '../schemas/table.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class CreateTableDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsInt()
  @Min(1)
  seats!: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
