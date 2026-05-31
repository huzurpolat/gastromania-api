import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { DashboardRange } from './dashboard-query.dto';

export class DashboardWidgetPreferenceDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsString()
  size?: string;
}

export class UpdateDashboardPreferencesDto {
  @IsOptional()
  @IsString()
  selectedLocationId?: string;

  @IsOptional()
  @IsIn(['today', '7d', '30d', '12m'])
  defaultRange?: DashboardRange;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleWidgets?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetPreferenceDto)
  widgets?: DashboardWidgetPreferenceDto[];
}
