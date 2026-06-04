import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateShiftTemplateDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  locationId?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  roleNeeded!: string;

  @Transform(({ value }) => trimString(value))
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @Transform(({ value }) => trimString(value))
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredStaffCount?: number;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  area?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShiftTemplateDto extends PartialType(
  CreateShiftTemplateDto,
) {}
