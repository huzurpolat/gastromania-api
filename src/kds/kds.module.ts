import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ModulesModule } from '../modules/modules.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { RecipesModule } from '../recipes/recipes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import {
  TableStatusLog,
  TableStatusLogSchema,
} from '../tables/schemas/table-status-log.schema';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';
import { KdsSettings, KdsSettingsSchema } from './schemas/kds-settings.schema';
import {
  KdsStatusLog,
  KdsStatusLogSchema,
} from './schemas/kds-status-log.schema';
import {
  KitchenStation,
  KitchenStationSchema,
} from './schemas/kitchen-station.schema';
import {
  PickupNumber,
  PickupNumberSchema,
} from './schemas/pickup-number.schema';

@Module({
  imports: [
    AuthJwtModule,
    RealtimeModule,
    ModulesModule,
    RecipesModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: TableStatusLog.name, schema: TableStatusLogSchema },
      { name: KdsStatusLog.name, schema: KdsStatusLogSchema },
      { name: KdsSettings.name, schema: KdsSettingsSchema },
      { name: KitchenStation.name, schema: KitchenStationSchema },
      { name: PickupNumber.name, schema: PickupNumberSchema },
    ]),
  ],
  controllers: [KdsController],
  providers: [KdsService],
  exports: [KdsService],
})
export class KdsModule {}
