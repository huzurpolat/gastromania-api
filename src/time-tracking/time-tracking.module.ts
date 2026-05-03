import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TimeEntry, TimeEntrySchema } from './schemas/time-entry.schema';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: TimeEntry.name, schema: TimeEntrySchema },
      { name: Location.name, schema: LocationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
})
export class TimeTrackingModule {}
