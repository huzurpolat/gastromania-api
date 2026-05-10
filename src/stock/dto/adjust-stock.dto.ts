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
}
