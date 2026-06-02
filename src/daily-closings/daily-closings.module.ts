import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessModule } from '../access/access.module';
import {
  Checklist,
  ChecklistSchema,
} from '../checklists/schemas/checklist.schema';
import {
  DashboardNotification,
  DashboardNotificationSchema,
} from '../dashboard/schemas/notification.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { DailyClosingsController } from './daily-closings.controller';
import { DailyClosingsService } from './daily-closings.service';
import {
  DailyClosing,
  DailyClosingSchema,
} from './schemas/daily-closing.schema';

@Module({
  imports: [
    AccessModule,
    MongooseModule.forFeature([
      { name: DailyClosing.name, schema: DailyClosingSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Order.name, schema: OrderSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: DashboardNotification.name, schema: DashboardNotificationSchema },
    ]),
  ],
  controllers: [DailyClosingsController],
  providers: [DailyClosingsService],
  exports: [DailyClosingsService],
})
export class DailyClosingsModule {}
