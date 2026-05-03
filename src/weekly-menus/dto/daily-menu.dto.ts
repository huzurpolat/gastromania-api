import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class DailyMenuDto {
  @IsDateString()
  date!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  description?: string;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuItemIds?: string[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isVegetarian?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
