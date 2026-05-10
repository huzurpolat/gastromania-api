import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import {
  DutyShift,
  DutyShiftSchema,
} from '../duty-schedules/schemas/duty-shift.schema';
import {
  InternalMessage,
  InternalMessageSchema,
} from '../internal-messages/schemas/internal-message.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { MenuItem, MenuItemSchema } from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import {
  StockItem,
  StockItemSchema,
} from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import { TimeEntry, TimeEntrySchema } from '../time-tracking/schemas/time-entry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WeeklyMenu, WeeklyMenuSchema } from '../weekly-menus/schemas/weekly-menu.schema';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: User.name, schema: UserSchema },
      { name: DutyShift.name, schema: DutyShiftSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: WeeklyMenu.name, schema: WeeklyMenuSchema },
      { name: InternalMessage.name, schema: InternalMessageSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [DemoDataController],
  providers: [DemoDataService],
})
export class DemoDataModule {}
