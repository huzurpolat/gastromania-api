import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { ModulesModule } from '../modules/modules.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReportsModule } from '../reports/reports.module';
import {
  TimeEntry,
  TimeEntrySchema,
} from '../time-tracking/schemas/time-entry.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentSchema,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  ShiftSwapRequest,
  ShiftSwapRequestSchema,
} from './schemas/shift-swap-request.schema';
import {
  ShiftSuggestion,
  ShiftSuggestionSchema,
} from './schemas/shift-suggestion.schema';
import {
  StaffAbsence,
  StaffAbsenceSchema,
} from './schemas/staff-absence.schema';
import {
  StaffAvailability,
  StaffAvailabilitySchema,
} from './schemas/staff-availability.schema';
import {
  StaffingPlanSuggestion,
  StaffingPlanSuggestionSchema,
} from './schemas/staffing-plan-suggestion.schema';
import {
  StaffNotification,
  StaffNotificationSchema,
} from './schemas/staff-notification.schema';
import {
  StaffPlanningAudit,
  StaffPlanningAuditSchema,
} from './schemas/staff-planning-audit.schema';
import {
  StaffSchedulePublication,
  StaffSchedulePublicationSchema,
} from './schemas/staff-schedule-publication.schema';
import {
  StaffWorkingTimeSettings,
  StaffWorkingTimeSettingsSchema,
} from './schemas/staff-working-time-settings.schema';
import {
  ShiftTemplate,
  ShiftTemplateSchema,
} from './schemas/shift-template.schema';
import { StaffShift, StaffShiftSchema } from './schemas/staff-shift.schema';
import { StaffScheduleController } from './staff-schedule.controller';
import { StaffPlanningController } from './staff-planning.controller';
import { StaffPlanningPublicationsController } from './staff-planning-publications.controller';
import { StaffNotificationsController } from './staff-notifications.controller';
import { StaffPlanningService } from './staff-planning.service';

@Module({
  imports: [
    AuthJwtModule,
    ModulesModule,
    RealtimeModule,
    ReportsModule,
    MongooseModule.forFeature([
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: StaffAvailability.name, schema: StaffAvailabilitySchema },
      { name: StaffAbsence.name, schema: StaffAbsenceSchema },
      { name: ShiftSwapRequest.name, schema: ShiftSwapRequestSchema },
      { name: ShiftSuggestion.name, schema: ShiftSuggestionSchema },
      {
        name: StaffingPlanSuggestion.name,
        schema: StaffingPlanSuggestionSchema,
      },
      { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
      { name: StaffPlanningAudit.name, schema: StaffPlanningAuditSchema },
      {
        name: StaffSchedulePublication.name,
        schema: StaffSchedulePublicationSchema,
      },
      { name: StaffNotification.name, schema: StaffNotificationSchema },
      {
        name: StaffWorkingTimeSettings.name,
        schema: StaffWorkingTimeSettingsSchema,
      },
      { name: User.name, schema: UserSchema },
      {
        name: UserLocationAssignment.name,
        schema: UserLocationAssignmentSchema,
      },
      { name: Location.name, schema: LocationSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
    ]),
  ],
  controllers: [
    StaffPlanningController,
    StaffPlanningPublicationsController,
    StaffNotificationsController,
    StaffScheduleController,
  ],
  providers: [StaffPlanningService],
  exports: [StaffPlanningService],
})
export class StaffPlanningModule {}
