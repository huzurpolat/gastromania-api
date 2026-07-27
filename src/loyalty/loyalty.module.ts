import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import {
  GuestProfile,
  GuestProfileSchema,
} from '../guests/schemas/guest-profile.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { LoyaltyController, VouchersController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyAccountSchema,
} from './schemas/guest-loyalty-account.schema';
import {
  GuestLoyaltyTransaction,
  GuestLoyaltyTransactionSchema,
} from './schemas/guest-loyalty-transaction.schema';
import {
  GuestVoucher,
  GuestVoucherSchema,
} from './schemas/guest-voucher.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: GuestLoyaltyAccount.name, schema: GuestLoyaltyAccountSchema },
      {
        name: GuestLoyaltyTransaction.name,
        schema: GuestLoyaltyTransactionSchema,
      },
      { name: GuestVoucher.name, schema: GuestVoucherSchema },
      { name: GuestProfile.name, schema: GuestProfileSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [LoyaltyController, VouchersController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
