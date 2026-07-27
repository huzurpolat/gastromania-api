import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ForecastEventQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateForecastEventDto {
  @IsString()
  locationId!: string;

  @IsString()
  title!: string;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-100)
  @Max(300)
  impactPercent!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateForecastEventDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-100)
  @Max(300)
  impactPercent?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}
