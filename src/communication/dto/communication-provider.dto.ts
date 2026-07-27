import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  CommunicationChannel,
  CommunicationProviderKey,
} from '../schemas/communication-provider.schema';

export class CreateCommunicationProviderDto {
  @IsEnum(CommunicationChannel)
  type!: CommunicationChannel;

  @IsEnum(CommunicationProviderKey)
  provider!: CommunicationProviderKey;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateCommunicationProviderDto extends PartialType(
  CreateCommunicationProviderDto,
) {}
