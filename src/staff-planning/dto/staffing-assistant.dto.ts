import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class StaffingAssistantPlanQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

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

export class GenerateStaffingPlanDto {
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeExistingShifts?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  avoidOvertime?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  strictRequestedOff?: boolean;
}

export class ApplyStaffingPlanItemDto {
  @IsString()
  itemId!: string;
}
