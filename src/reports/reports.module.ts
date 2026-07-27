import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessModule } from '../access/access.module';
import { Area, AreaSchema } from '../areas/schemas/area.schema';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { ModulesModule } from '../modules/modules.module';
import {
  MenuItem,
  MenuItemSchema,
} from '../menu-items/schemas/menu-item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import {
  StaffWorkingTimeSettings,
  StaffWorkingTimeSettingsSchema,
} from '../staff-planning/schemas/staff-working-time-settings.schema';
import {
  StaffShift,
  StaffShiftSchema,
} from '../staff-planning/schemas/staff-shift.schema';
import { TimeEntry, TimeEntrySchema } from '../time-tracking/schemas/time-entry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';
import { BenchmarkingController } from './benchmarking.controller';
import { BenchmarkingService } from './benchmarking.service';
import { ExecutiveDashboardController } from './executive-dashboard.controller';
import { ExecutiveDashboardService } from './executive-dashboard.service';
import { LaborAnalyticsController } from './labor-analytics.controller';
import { LaborAnalyticsService } from './labor-analytics.service';
import { MarginReportsService } from './margin-reports.service';
import { ReportsController } from './reports.controller';
import {
  MarginAnalysisRun,
  MarginAnalysisRunSchema,
} from './schemas/margin-analysis-run.schema';
import {
  ForecastEvent,
  ForecastEventSchema,
} from './schemas/forecast-event.schema';
import {
  ForecastSnapshot,
  ForecastSnapshotSchema,
} from './schemas/forecast-snapshot.schema';

@Module({
  imports: [
    AccessModule,
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: MenuItem.name, schema: MenuItemSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Area.name, schema: AreaSchema },
      { name: Region.name, schema: RegionSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: User.name, schema: UserSchema },
      {
        name: StaffWorkingTimeSettings.name,
        schema: StaffWorkingTimeSettingsSchema,
      },
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: MarginAnalysisRun.name, schema: MarginAnalysisRunSchema },
      { name: ForecastEvent.name, schema: ForecastEventSchema },
      { name: ForecastSnapshot.name, schema: ForecastSnapshotSchema },
    ]),
  ],
  controllers: [
    ReportsController,
    LaborAnalyticsController,
    ForecastController,
    BenchmarkingController,
    ExecutiveDashboardController,
  ],
  providers: [
    MarginReportsService,
    LaborAnalyticsService,
    ForecastService,
    BenchmarkingService,
    ExecutiveDashboardService,
  ],
  exports: [
    MarginReportsService,
    LaborAnalyticsService,
    ForecastService,
    BenchmarkingService,
    ExecutiveDashboardService,
  ],
})
export class ReportsModule {}
