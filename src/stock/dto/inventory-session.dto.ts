import { IsArray, IsMongoId, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class StartInventorySessionDto {
  @IsMongoId()
  locationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InventoryCountLineDto {
  @IsMongoId()
  stockItemId!: string;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;
}

export class CompleteInventorySessionDto {
  @IsArray()
  counts!: InventoryCountLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
