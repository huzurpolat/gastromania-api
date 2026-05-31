import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInventoryLocationDto {
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
