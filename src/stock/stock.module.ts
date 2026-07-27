import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { ModulesModule } from '../modules/modules.module';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StockItem, StockItemSchema } from './schemas/stock-item.schema';
import {
  InventoryCategory,
  InventoryCategorySchema,
} from './schemas/inventory-category.schema';
import {
  InventoryCount,
  InventoryCountSchema,
} from './schemas/inventory-count.schema';
import {
  InventoryBatch,
  InventoryBatchSchema,
} from './schemas/inventory-batch.schema';
import {
  InventoryLocation,
  InventoryLocationSchema,
} from './schemas/inventory-location.schema';
import {
  InventorySession,
  InventorySessionSchema,
} from './schemas/inventory-session.schema';
import { StockAlert, StockAlertSchema } from './schemas/stock-alert.schema';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: StockItem.name, schema: StockItemSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: InventoryLocation.name, schema: InventoryLocationSchema },
      { name: InventoryCategory.name, schema: InventoryCategorySchema },
      { name: StockAlert.name, schema: StockAlertSchema },
      { name: InventorySession.name, schema: InventorySessionSchema },
      { name: InventoryCount.name, schema: InventoryCountSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
