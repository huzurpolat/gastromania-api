import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  MarketingCampaignStatus,
  MarketingCampaignType,
} from '../schemas/marketing-campaign.schema';

export class CreateMarketingCampaignDto {
  @IsString()
  name!: string;

  @IsEnum(MarketingCampaignType)
  type!: MarketingCampaignType;

  @IsOptional()
  @IsEnum(MarketingCampaignStatus)
  status?: MarketingCampaignStatus;

  @IsString()
  targetSegmentId!: string;

  @IsString()
  subject!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsMongoId()
  voucherId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateMarketingCampaignDto extends PartialType(
  CreateMarketingCampaignDto,
) {}
