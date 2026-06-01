import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  ShiftSwapRequest,
  ShiftSwapRequestSchema,
} from './schemas/shift-swap-request.schema';
import {
  StaffAbsence,
  StaffAbsenceSchema,
} from './schemas/staff-absence.schema';
import {
  StaffAvailability,
  StaffAvailabilitySchema,
} from './schemas/staff-availability.schema';
import {
  StaffNotification,
  StaffNotificationSchema,
} from './schemas/staff-notification.schema';
import {
  StaffPlanningAudit,
  StaffPlanningAuditSchema,
} from './schemas/staff-planning-audit.schema';
import { StaffShift, StaffShiftSchema } from './schemas/staff-shift.schema';
import { StaffPlanningController } from './staff-planning.controller';
import { StaffPlanningService } from './staff-planning.service';

@Module({
  imports: [
    AuthJwtModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: StaffAvailability.name, schema: StaffAvailabilitySchema },
      { name: StaffAbsence.name, schema: StaffAbsenceSchema },
      { name: ShiftSwapRequest.name, schema: ShiftSwapRequestSchema },
      { name: StaffPlanningAudit.name, schema: StaffPlanningAuditSchema },
      { name: StaffNotification.name, schema: StaffNotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [StaffPlanningController],
  providers: [StaffPlanningService],
  exports: [StaffPlanningService],
})
export class StaffPlanningModule {}
