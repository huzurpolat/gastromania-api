import { IsEnum } from 'class-validator';
import { PurchaseOrderStatus } from '../schemas/purchase-order.schema';

export class UpdatePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;
}
