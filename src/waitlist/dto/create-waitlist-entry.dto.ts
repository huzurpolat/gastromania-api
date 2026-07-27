import {
  IsEmail,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { WaitlistSource } from '../schemas/waitlist-entry.schema';

export class CreateWaitlistEntryDto {
  @IsMongoId()
  locationId!: string;

  @IsString()
  guestName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  guestCount!: number;

  @IsOptional()
  @IsMongoId()
  preferredTableId?: string;

  @IsOptional()
  @IsEnum(WaitlistSource)
  source?: WaitlistSource;

  @IsOptional()
  @IsString()
  note?: string;
}
