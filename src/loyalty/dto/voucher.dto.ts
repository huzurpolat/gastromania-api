import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { GuestVoucherType } from '../schemas/guest-voucher.schema';

export class CreateGuestVoucherDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  guestProfileId?: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsEnum(GuestVoucherType)
  type!: GuestVoucherType;

  @IsDateString()
  expiresAt!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateGuestVoucherDto extends PartialType(CreateGuestVoucherDto) {}

export class RedeemGuestVoucherDto {
  @IsOptional()
  @IsString()
  guestProfileId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
