import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { ModulesModule } from '../modules/modules.module';
import { MenuItem, MenuItemSchema } from '../menu-items/schemas/menu-item.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockAlert,
  StockAlertSchema,
} from '../stock/schemas/stock-alert.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import {
  TableStatusLog,
  TableStatusLogSchema,
} from '../tables/schemas/table-status-log.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import {
  InventoryBatch,
  InventoryBatchSchema,
} from '../stock/schemas/inventory-batch.schema';
import {
  KdsStatusLog,
  KdsStatusLogSchema,
} from '../kds/schemas/kds-status-log.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrderTenantBackfillService } from './order-tenant-backfill.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthJwtModule,
    RealtimeModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockAlert.name, schema: StockAlertSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: TableStatusLog.name, schema: TableStatusLogSchema },
      { name: KdsStatusLog.name, schema: KdsStatusLogSchema },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, RecipeInventoryService, OrderTenantBackfillService],
  exports: [OrdersService],
})
export class OrdersModule {}
