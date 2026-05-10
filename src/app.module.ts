import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { DemoDataModule } from './demo-data/demo-data.module';
import { DutySchedulesModule } from './duty-schedules/duty-schedules.module';
import { InternalMessagesModule } from './internal-messages/internal-messages.module';
import { LocationsModule } from './locations/locations.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { OrdersModule } from './orders/orders.module';
import { ReservationsModule } from './reservations/reservations.module';
import { StockModule } from './stock/stock.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TablesModule } from './tables/tables.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { UsersModule } from './users/users.module';
import { WeeklyMenusModule } from './weekly-menus/weekly-menus.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),

    UsersModule,
    AuthModule,
    LocationsModule,
    TablesModule,
    ReservationsModule,
    OrdersModule,
    MenuItemsModule,
    DutySchedulesModule,
    TimeTrackingModule,
    WeeklyMenusModule,
    InternalMessagesModule,
    DemoDataModule,
    StockModule,
    SuppliersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
