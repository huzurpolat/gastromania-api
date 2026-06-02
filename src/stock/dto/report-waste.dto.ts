import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { StockMovementType } from '../schemas/stock-movement.schema';

export class ReportWasteDto {
  @IsMongoId()
  stockItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsEnum(StockMovementType)
  type!:
    | StockMovementType.Shrinkage
    | StockMovementType.Spoilage
    | StockMovementType.Breakage
    | StockMovementType.Loss;

  @IsString()
  @MaxLength(240)
  reason!: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
