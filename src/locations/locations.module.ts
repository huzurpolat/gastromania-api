import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { LocationGuard } from '../auth/guards/location.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Area, AreaSchema } from '../areas/schemas/area.schema';
import { City, CitySchema } from '../cities/schemas/city.schema';
import { CounterPayment, CounterPaymentSchema } from '../counter/schemas/counter-payment.schema';
import { CounterSettings, CounterSettingsSchema } from '../counter/schemas/counter-settings.schema';
import { CounterOrderStatusLog, CounterOrderStatusLogSchema } from '../counter/schemas/counter-order-status-log.schema';
import { DailyClosing, DailyClosingSchema } from '../daily-closings/schemas/daily-closing.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import { InventoryBatch, InventoryBatchSchema } from '../stock/schemas/inventory-batch.schema';
import { InventoryLocation, InventoryLocationSchema } from '../stock/schemas/inventory-location.schema';
import { InventorySession, InventorySessionSchema } from '../stock/schemas/inventory-session.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../stock/schemas/purchase-order.schema';
import { StockAlert, StockAlertSchema } from '../stock/schemas/stock-alert.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import { StockMovement, StockMovementSchema } from '../stock/schemas/stock-movement.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentSchema,
} from '../users/schemas/user-location-assignment.schema';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { Location, LocationSchema } from './schemas/location.schema';
import { TenantLocationsController } from './tenant-locations.controller';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: Area.name, schema: AreaSchema },
      { name: City.name, schema: CitySchema },
      { name: Region.name, schema: RegionSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: Order.name, schema: OrderSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: InventoryLocation.name, schema: InventoryLocationSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: InventorySession.name, schema: InventorySessionSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: StockAlert.name, schema: StockAlertSchema },
      { name: DailyClosing.name, schema: DailyClosingSchema },
      { name: CounterPayment.name, schema: CounterPaymentSchema },
      { name: CounterSettings.name, schema: CounterSettingsSchema },
      { name: CounterOrderStatusLog.name, schema: CounterOrderStatusLogSchema },
      { name: User.name, schema: UserSchema },
      {
        name: UserLocationAssignment.name,
        schema: UserLocationAssignmentSchema,
      },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [LocationsController, TenantLocationsController],
  providers: [LocationsService, TenantGuard, LocationGuard],
  exports: [LocationsService],
})
export class LocationsModule {}
