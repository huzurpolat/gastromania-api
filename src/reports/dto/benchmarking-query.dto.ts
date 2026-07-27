import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BenchmarkingQueryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'quarter', 'year'])
  period?: 'week' | 'month' | 'quarter' | 'year';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
