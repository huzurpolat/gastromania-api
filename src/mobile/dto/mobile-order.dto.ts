import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CourseType,
  OrderPriority,
  OrderStatus,
  ProductionArea,
} from '../../orders/schemas/order.schema';

export class MobileOrderItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsBoolean()
  isKitchenItem!: boolean;

  @IsOptional()
  @IsEnum(ProductionArea)
  productionArea?: ProductionArea;

  @IsOptional()
  @IsEnum(CourseType)
  courseType?: CourseType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialRequests?: string[];

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateMobileOrderDto {
  @IsString()
  locationId!: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  customerNumber?: string;

  @IsOptional()
  @IsEnum(OrderPriority)
  priority?: OrderPriority;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileOrderItemDto)
  items!: MobileOrderItemDto[];
}

export class UpdateMobileOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
