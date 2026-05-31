import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  return trimString(value);
};

export class CreateUserDto {
  @Transform(({ value }) => {
    const trimmedValue = trimString(value);

    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  firstName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  lastName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  mobile?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  vatId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  taxOffice?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  department?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  locationIds?: string[];
}
