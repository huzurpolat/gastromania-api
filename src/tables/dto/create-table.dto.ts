import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TableShape, TableStatus } from '../schemas/table.schema';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);

  return trimmedValue === '' ? undefined : trimmedValue;
};

export class CreateTableDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  regionId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tableNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tableName?: string;

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

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  qrEnabled?: boolean;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  qrMenuId?: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  planX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  planY?: number;

  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(32)
  planWidth?: number;

  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(24)
  planHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(359)
  planRotation?: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  floorId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  floorName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  planFloor?: string;

  @IsOptional()
  @IsEnum(TableShape)
  planShape?: TableShape;
}
