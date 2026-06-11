import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSupplierPriceDto {
  @IsMongoId()
  supplierId!: string;

  @IsNumber()
  @Min(0)
  unitPriceNet!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unit!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSupplierPriceDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceNet?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
