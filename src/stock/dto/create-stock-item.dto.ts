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

export class CreateStockItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  articleNumber?: string;

  @IsMongoId()
  locationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  unit!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  minQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetQuantity?: number;

  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ean?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePriceNet?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePriceGross?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  storageLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
