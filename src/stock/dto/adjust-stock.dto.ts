import { IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { StockMovementType } from '../schemas/stock-movement.schema';

export class AdjustStockDto {
  @IsNumber()
  quantityChange!: number;

  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsNumber()
  unitPriceNet?: number;
}
