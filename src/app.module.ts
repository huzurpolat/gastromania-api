import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { DemoDataModule } from './demo-data/demo-data.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DutySchedulesModule } from './duty-schedules/duty-schedules.module';
import { InternalMessagesModule } from './internal-messages/internal-messages.module';
import { LocationsModule } from './locations/locations.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { MobileModule } from './mobile/mobile.module';
import { OrdersModule } from './orders/orders.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RbacModule } from './rbac/rbac.module';
import { KdsModule } from './kds/kds.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SettingsModule } from './settings/settings.module';
import { StockModule } from './stock/stock.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TablesModule } from './tables/tables.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { UsersModule } from './users/users.module';
import { WeeklyMenusModule } from './weekly-menus/weekly-menus.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/gastromania',
        ),
      }),
    }),

    UsersModule,
    AuthModule,
    LocationsModule,
    TablesModule,
    ReservationsModule,
    RealtimeModule,
    KdsModule,
    RbacModule,
    SettingsModule,
    MobileModule,
    OrdersModule,
    MenuItemsModule,
    DutySchedulesModule,
    TimeTrackingModule,
    WeeklyMenusModule,
    InternalMessagesModule,
    DemoDataModule,
    DashboardModule,
    StockModule,
    SuppliersModule,
    ChecklistsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
