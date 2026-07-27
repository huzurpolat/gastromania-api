import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { GuestsModule } from '../guests/guests.module';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import {
  WaitlistEntry,
  WaitlistEntrySchema,
} from './schemas/waitlist-entry.schema';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [
    AuthJwtModule,
    ReservationsModule,
    GuestsModule,
    MongooseModule.forFeature([
      { name: WaitlistEntry.name, schema: WaitlistEntrySchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: Reservation.name, schema: ReservationSchema },
    ]),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
