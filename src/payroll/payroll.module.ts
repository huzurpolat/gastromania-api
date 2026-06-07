import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessModule } from '../access/access.module';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ModulesModule } from '../modules/modules.module';
import {
  StaffAbsence,
  StaffAbsenceSchema,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftSchema,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  TimeEntry,
  TimeEntrySchema,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import {
  PayrollPeriod,
  PayrollPeriodSchema,
} from './schemas/payroll-period.schema';

@Module({
  imports: [
    AccessModule,
    AuthJwtModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: StaffShift.name, schema: StaffShiftSchema },
      { name: StaffAbsence.name, schema: StaffAbsenceSchema },
      { name: PayrollPeriod.name, schema: PayrollPeriodSchema },
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
