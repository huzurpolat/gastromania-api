import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export const marginReportRanges = [
  'today',
  'yesterday',
  'week',
  'month',
  'custom',
] as const;

export type MarginReportRange = (typeof marginReportRanges)[number];

export class MarginReportQueryDto {
  @IsOptional()
  @IsIn(marginReportRanges)
  range?: MarginReportRange;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsOptional()
  @IsMongoId()
  regionId?: string;

  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsMongoId()
  menuItemId?: string;
}
