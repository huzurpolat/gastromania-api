import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ReceiveStockDto {
  @IsMongoId()
  stockItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceNet?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  storageLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
