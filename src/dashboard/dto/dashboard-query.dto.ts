import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export type DashboardRange = 'today' | '7d' | '30d' | '12m';

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsIn(['today', '7d', '30d', '12m'])
  range?: DashboardRange;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
