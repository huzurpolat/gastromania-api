import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { DutySchedulesController } from './duty-schedules.controller';
import { DutySchedulesService } from './duty-schedules.service';
import { DutyShift, DutyShiftSchema } from './schemas/duty-shift.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: DutyShift.name, schema: DutyShiftSchema },
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DutySchedulesController],
  providers: [DutySchedulesService],
})
export class DutySchedulesModule {}
