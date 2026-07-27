import { IsArray, IsOptional, IsString } from 'class-validator';
import { MarketingSegmentRule } from '../schemas/marketing-segment.schema';

export class CreateMarketingSegmentDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  rules?: MarketingSegmentRule[];
}
