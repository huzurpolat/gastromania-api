import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class MobileQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}
