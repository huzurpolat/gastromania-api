import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { ModulesModule } from '../modules/modules.module';
import {
  StaffShift,
  StaffShiftSchema,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  StaffAbsence,
  StaffAbsenceSchema,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentSchema,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  TimeCorrection,
  TimeCorrectionSchema,
} from './schemas/time-correction.schema';
import {
  TimeEntryBreak,
  TimeEntryBreakSchema,
} from './schemas/time-entry-break.schema';
import { TimeEntry, TimeEntrySchema } from './schemas/time-entry.schema';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

@Module({
  imports: [
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: TimeEntryBreak.name, schema: TimeEntryBreakSchema },
      { name: TimeCorrection.name, schema: TimeCorrectionSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: User.name, schema: UserSchema },
      {
        name: UserLocationAssignment.name,
        schema: UserLocationAssignmentSchema,
      },
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: StaffAbsence.name, schema: StaffAbsenceSchema },
    ]),
  ],
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
})
export class TimeTrackingModule {}
