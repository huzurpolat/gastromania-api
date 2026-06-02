import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessModule } from '../access/access.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemSchema,
} from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import { MarginReportsService } from './margin-reports.service';
import { ReportsController } from './reports.controller';
import {
  MarginAnalysisRun,
  MarginAnalysisRunSchema,
} from './schemas/margin-analysis-run.schema';

@Module({
  imports: [
    AccessModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: Location.name, schema: LocationSchema },
      { name: MarginAnalysisRun.name, schema: MarginAnalysisRunSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [MarginReportsService],
  exports: [MarginReportsService],
})
export class ReportsModule {}
