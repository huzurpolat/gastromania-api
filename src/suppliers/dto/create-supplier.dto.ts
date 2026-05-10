import {
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @IsMongoId()
  locationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  deliveryDays?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderDeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  minimumOrderValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(700)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
