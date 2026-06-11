import {
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReorderPurchaseOrderItemDto {
  @IsMongoId()
  stockItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedUnitCost?: number;
}

export class CreateReorderPurchaseOrderDto {
  @IsMongoId()
  locationId!: string;

  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReorderPurchaseOrderItemDto)
  items!: CreateReorderPurchaseOrderItemDto[];
}
