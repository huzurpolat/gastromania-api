import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateGuestProfileDto {
  @IsOptional()
  @IsMongoId()
  locationId?: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsISO8601()
  birthday?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  preferredArea?: string;

  @IsOptional()
  @IsMongoId()
  preferredTableId?: string;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  newsletterConsent?: boolean;
}
