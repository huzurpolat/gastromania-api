import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemSchema,
} from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { QrOrdersController } from './qr-orders.controller';
import { QrOrdersService } from './qr-orders.service';

@Module({
  imports: [
    RealtimeModule,
    MongooseModule.forFeature([
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Company.name, schema: CompanySchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [QrOrdersController],
  providers: [QrOrdersService],
})
export class QrOrdersModule {}
