import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { MarketingAutomationType } from '../schemas/marketing-automation.schema';

export class CreateMarketingAutomationDto {
  @IsString()
  name!: string;

  @IsEnum(MarketingAutomationType)
  type!: MarketingAutomationType;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  triggerRule?: Record<string, unknown>;

  @IsString()
  targetSegment!: string;

  @IsOptional()
  @IsString()
  campaignTemplateId?: string;

  @IsOptional()
  @IsString()
  voucherTemplateId?: string;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;
}

export class UpdateMarketingAutomationDto extends PartialType(
  CreateMarketingAutomationDto,
) {}
