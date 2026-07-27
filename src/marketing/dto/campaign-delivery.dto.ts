import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { CommunicationChannel } from '../../communication/schemas/communication-provider.schema';

export class PrepareCampaignDeliveryDto {
  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;
}

export class SendCampaignTestDto {
  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;

  @IsString()
  recipient!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
