import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ModulesModule } from '../modules/modules.module';
import { MenuItemsController } from './menu-items.controller';
import { MenuItemsService } from './menu-items.service';
import { MenuItem, MenuItemSchema } from './schemas/menu-item.schema';

@Module({
  imports: [
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: MenuItem.name, schema: MenuItemSchema },
    ]),
  ],
  controllers: [MenuItemsController],
  providers: [MenuItemsService],
})
export class MenuItemsModule {}
