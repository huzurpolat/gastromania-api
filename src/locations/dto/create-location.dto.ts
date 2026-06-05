import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmedValue = trimString(value);

  return trimmedValue === '' ? undefined : trimmedValue;
};

class LocationTablePlanAreaDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  floor?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  width!: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  height!: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

class LocationTablePlanObjectDto extends LocationTablePlanAreaDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  kind!: string;

  @IsNumber()
  @Min(0)
  @Max(359)
  rotation!: number;
}

export class CreateLocationDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  slug?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  address?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  street!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  zip!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  postalCode?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  city!: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  federalState?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  phone?: string;

  @Transform(({ value }) => {
    const trimmedValue = optionalTrimString(value);

    return typeof trimmedValue === 'string'
      ? trimmedValue.toLowerCase()
      : trimmedValue;
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  companyId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  areaId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  regionId?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tablePlanFloors?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationTablePlanAreaDto)
  tablePlanAreas?: LocationTablePlanAreaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationTablePlanObjectDto)
  tablePlanObjects?: LocationTablePlanObjectDto[];
}
