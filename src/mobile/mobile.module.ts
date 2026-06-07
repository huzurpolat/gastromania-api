import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import {
  Checklist,
  ChecklistSchema,
} from '../checklists/schemas/checklist.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemSchema,
} from '../menu-items/schemas/menu-item.schema';
import { ModulesModule } from '../modules/modules.module';
import { OrdersModule } from '../orders/orders.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [
    AuthJwtModule,
    OrdersModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
    ]),
  ],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
