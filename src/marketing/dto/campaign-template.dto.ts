import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { MarketingCampaignType } from '../schemas/marketing-campaign.schema';

export class CreateCampaignTemplateDto {
  @IsString()
  name!: string;

  @IsEnum(MarketingCampaignType)
  type!: MarketingCampaignType;

  @IsString()
  subject!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCampaignTemplateDto extends PartialType(
  CreateCampaignTemplateDto,
) {}
