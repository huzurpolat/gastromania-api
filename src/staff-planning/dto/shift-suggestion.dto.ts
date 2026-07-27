import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ShiftSuggestionQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  status?: string;

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
}

export class GenerateShiftSuggestionsDto {
  @IsString()
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;
}
