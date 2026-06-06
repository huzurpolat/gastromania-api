import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './access/access.module';
import { AreasModule } from './areas/areas.module';
import { CitiesModule } from './cities/cities.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { CompaniesModule } from './companies/companies.module';
import { CounterModule } from './counter/counter.module';
import { DemoDataModule } from './demo-data/demo-data.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DailyClosingsModule } from './daily-closings/daily-closings.module';
import { DepartmentsModule } from './departments/departments.module';
import { DutySchedulesModule } from './duty-schedules/duty-schedules.module';
import { EmployeesModule } from './employees/employees.module';
import { InternalMessagesModule } from './internal-messages/internal-messages.module';
import { LocationsModule } from './locations/locations.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { MobileModule } from './mobile/mobile.module';
import { ModulesModule } from './modules/modules.module';
import { OrdersModule } from './orders/orders.module';
import { PayrollModule } from './payroll/payroll.module';
import { QrOrdersModule } from './qr-orders/qr-orders.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReportsModule } from './reports/reports.module';
import { RegionsModule } from './regions/regions.module';
import { RbacModule } from './rbac/rbac.module';
import { KdsModule } from './kds/kds.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SettingsModule } from './settings/settings.module';
import { StaffPlanningModule } from './staff-planning/staff-planning.module';
import { StockModule } from './stock/stock.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TablesModule } from './tables/tables.module';
import { TenantsModule } from './tenants/tenants.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { UsersModule } from './users/users.module';
import { WeeklyMenusModule } from './weekly-menus/weekly-menus.module';
import { HealthController } from './health.controller';
import { HrModule } from './hr/hr.module';

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

    AccessModule,
    AreasModule,
    CitiesModule,
    CompaniesModule,
    RegionsModule,
    UsersModule,
    DepartmentsModule,
    EmployeesModule,
    HrModule,
    AuthModule,
    LocationsModule,
    TablesModule,
    ReservationsModule,
    RecipesModule,
    ReportsModule,
    RealtimeModule,
    KdsModule,
    RbacModule,
    SettingsModule,
    MobileModule,
    ModulesModule,
    TenantsModule,
    OrdersModule,
    QrOrdersModule,
    MenuItemsModule,
    DutySchedulesModule,
    TimeTrackingModule,
    PayrollModule,
    WeeklyMenusModule,
    InternalMessagesModule,
    DemoDataModule,
    DashboardModule,
    DailyClosingsModule,
    StaffPlanningModule,
    StockModule,
    SuppliersModule,
    ChecklistsModule,
    CounterModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
