import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { GuestsModule } from '../guests/guests.module';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { Reservation, ReservationSchema } from './schemas/reservation.schema';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    AuthJwtModule,
    GuestsModule,
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
    ]),
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
