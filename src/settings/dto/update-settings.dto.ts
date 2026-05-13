import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);
  return trimmedValue === '' ? undefined : trimmedValue;
};

export class UpdateSettingsDto {
  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  contactEmail?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locale?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(16)
  orderPrefix?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  primaryColor?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  backgroundColor?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  sidebarColor?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  panelColor?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brandName?: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultTaxRate?: number;

  @IsOptional()
  @IsBoolean()
  enablePushMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDemoData?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mongoConnectionName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(280)
  mongoHost?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mongoDatabase?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mongoUsername?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mongoAuthSource?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mongoOptions?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  mongoPassword?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
