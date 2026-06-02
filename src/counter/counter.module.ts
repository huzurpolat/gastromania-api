import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { MenuItem, MenuItemSchema } from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { InventoryBatch, InventoryBatchSchema } from '../stock/schemas/inventory-batch.schema';
import { StockAlert, StockAlertSchema } from '../stock/schemas/stock-alert.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import { StockMovement, StockMovementSchema } from '../stock/schemas/stock-movement.schema';
import { CounterController } from './counter.controller';
import { CounterOrderService } from './counter-order.service';
import { CounterPaymentService } from './counter-payment.service';
import { PickupNumberService } from './pickup-number.service';
import {
  CounterOrderStatusLog,
  CounterOrderStatusLogSchema,
} from './schemas/counter-order-status-log.schema';
import {
  CounterPayment,
  CounterPaymentSchema,
} from './schemas/counter-payment.schema';
import {
  CounterSettings,
  CounterSettingsSchema,
} from './schemas/counter-settings.schema';
import {
  PickupNumberSequence,
  PickupNumberSequenceSchema,
} from './schemas/pickup-number-sequence.schema';

@Module({
  imports: [
    AuthJwtModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockAlert.name, schema: StockAlertSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: InventoryBatch.name, schema: InventoryBatchSchema },
      { name: CounterSettings.name, schema: CounterSettingsSchema },
      { name: CounterPayment.name, schema: CounterPaymentSchema },
      { name: PickupNumberSequence.name, schema: PickupNumberSequenceSchema },
      { name: CounterOrderStatusLog.name, schema: CounterOrderStatusLogSchema },
    ]),
  ],
  controllers: [CounterController],
  providers: [
    CounterOrderService,
    CounterPaymentService,
    PickupNumberService,
    RecipeInventoryService,
  ],
  exports: [CounterOrderService, PickupNumberService],
})
export class CounterModule {}
