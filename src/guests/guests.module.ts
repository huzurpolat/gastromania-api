import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import {
  WaitlistEntry,
  WaitlistEntrySchema,
} from '../waitlist/schemas/waitlist-entry.schema';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';
import {
  GuestProfile,
  GuestProfileSchema,
} from './schemas/guest-profile.schema';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyAccountSchema,
} from '../loyalty/schemas/guest-loyalty-account.schema';
import {
  GuestVoucher,
  GuestVoucherSchema,
} from '../loyalty/schemas/guest-voucher.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: GuestProfile.name, schema: GuestProfileSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: WaitlistEntry.name, schema: WaitlistEntrySchema },
      { name: Order.name, schema: OrderSchema },
      { name: GuestLoyaltyAccount.name, schema: GuestLoyaltyAccountSchema },
      { name: GuestVoucher.name, schema: GuestVoucherSchema },
    ]),
  ],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService],
})
export class GuestsModule {}
