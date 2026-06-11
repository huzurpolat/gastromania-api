import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimString = (value: unknown): unknown => {
  const trimmed = trimString(value);
  return trimmed === '' ? undefined : trimmed;
};

export class PublicQrOrderItemDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  menuItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedExtraIds?: string[];
}

export class CreatePublicQrOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PublicQrOrderItemDto)
  items!: PublicQrOrderItemDto[];

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  guestNote?: string;

  @Transform(({ value }) => optionalTrimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergyNote?: string;
}
