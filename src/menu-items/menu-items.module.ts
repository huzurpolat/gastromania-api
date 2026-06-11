import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ModulesModule } from '../modules/modules.module';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';
import { MenuItem, MenuItemSchema } from './schemas/menu-item.schema';

@Module({
  imports: [
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: StockItem.name, schema: StockItemSchema },
    ]),
  ],
  controllers: [MenuItemsController],
  providers: [MenuItemsService],
})
export class MenuItemsModule {}
