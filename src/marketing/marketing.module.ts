import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import {
  CampaignMessage,
  CampaignMessageSchema,
} from '../communication/schemas/campaign-message.schema';
import {
  CommunicationProvider,
  CommunicationProviderSchema,
} from '../communication/schemas/communication-provider.schema';
import {
  GuestProfile,
  GuestProfileSchema,
} from '../guests/schemas/guest-profile.schema';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyAccountSchema,
} from '../loyalty/schemas/guest-loyalty-account.schema';
import {
  GuestVoucher,
  GuestVoucherSchema,
} from '../loyalty/schemas/guest-voucher.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationSchema,
} from '../reservations/schemas/reservation.schema';
import {
  WaitlistEntry,
  WaitlistEntrySchema,
} from '../waitlist/schemas/waitlist-entry.schema';
import { MarketingController } from './marketing.controller';
import { MarketingAutomationService } from './marketing-automation.service';
import {
  CampaignTemplate,
  CampaignTemplateSchema,
} from './schemas/campaign-template.schema';
import {
  MarketingAutomation,
  MarketingAutomationSchema,
} from './schemas/marketing-automation.schema';
import { MarketingService } from './marketing.service';
import {
  MarketingCampaign,
  MarketingCampaignSchema,
} from './schemas/marketing-campaign.schema';
import {
  MarketingSegment,
  MarketingSegmentSchema,
} from './schemas/marketing-segment.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: MarketingCampaign.name, schema: MarketingCampaignSchema },
      { name: MarketingSegment.name, schema: MarketingSegmentSchema },
      { name: MarketingAutomation.name, schema: MarketingAutomationSchema },
      { name: CampaignTemplate.name, schema: CampaignTemplateSchema },
      { name: CampaignMessage.name, schema: CampaignMessageSchema },
      { name: CommunicationProvider.name, schema: CommunicationProviderSchema },
      { name: GuestProfile.name, schema: GuestProfileSchema },
      { name: GuestLoyaltyAccount.name, schema: GuestLoyaltyAccountSchema },
      { name: GuestVoucher.name, schema: GuestVoucherSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: WaitlistEntry.name, schema: WaitlistEntrySchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingAutomationService],
  exports: [MarketingService, MarketingAutomationService],
})
export class MarketingModule {}
