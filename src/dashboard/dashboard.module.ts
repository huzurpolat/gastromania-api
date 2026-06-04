import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import {
  Checklist,
  ChecklistSchema,
} from '../checklists/schemas/checklist.schema';
import {
  DutyShift,
  DutyShiftSchema,
} from '../duty-schedules/schemas/duty-shift.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { StockItem, StockItemSchema } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardController } from './dashboard.controller';
import { DashboardRealtimeService } from './dashboard-realtime.service';
import { DashboardService } from './dashboard.service';
import {
  DashboardPreference,
  DashboardPreferenceSchema,
} from './schemas/dashboard-preference.schema';
import {
  DashboardNotification,
  DashboardNotificationSchema,
} from './schemas/notification.schema';
import {
  DailyClosing,
  DailyClosingSchema,
} from '../daily-closings/schemas/daily-closing.schema';
import {
  EmployeeDocumentRecord,
  EmployeeDocumentRecordSchema,
} from '../hr/schemas/employee-document.schema';
import {
  EmployeeFeedback,
  EmployeeFeedbackSchema,
} from '../hr/schemas/employee-feedback.schema';
import {
  JobApplicant,
  JobApplicantSchema,
} from '../hr/schemas/job-applicant.schema';

@Module({
  imports: [
    AuthJwtModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: Checklist.name, schema: ChecklistSchema },
      { name: DutyShift.name, schema: DutyShiftSchema },
      { name: User.name, schema: UserSchema },
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: DashboardPreference.name, schema: DashboardPreferenceSchema },
      { name: DashboardNotification.name, schema: DashboardNotificationSchema },
      { name: DailyClosing.name, schema: DailyClosingSchema },
      {
        name: EmployeeDocumentRecord.name,
        schema: EmployeeDocumentRecordSchema,
      },
      { name: EmployeeFeedback.name, schema: EmployeeFeedbackSchema },
      { name: JobApplicant.name, schema: JobApplicantSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    DashboardAnalyticsService,
    DashboardRealtimeService,
    DashboardService,
  ],
})
export class DashboardModule {}
