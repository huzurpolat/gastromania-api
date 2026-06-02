import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { UpdateCounterSettingsDto } from './dto/update-counter-settings.dto';
import {
  CounterSettings,
  CounterSettingsDocument,
} from './schemas/counter-settings.schema';
import {
  PickupNumberSequence,
  PickupNumberSequenceDocument,
} from './schemas/pickup-number-sequence.schema';

@Injectable()
export class PickupNumberService {
  constructor(
    @InjectModel(CounterSettings.name)
    private readonly settingsModel: Model<CounterSettingsDocument>,
    @InjectModel(PickupNumberSequence.name)
    private readonly sequenceModel: Model<PickupNumberSequenceDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getSettings(
    locationId: string,
    actor?: AuthenticatedUser,
  ): Promise<CounterSettingsDocument> {
    if (actor) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    }

    return this.settingsModel
      .findOneAndUpdate(
        { locationId },
        {
          $setOnInsert: {
            companyId: actor?.companyId,
            locationId,
            pickupPrefix: 'A',
            pickupStartNumber: 1,
            pickupNumberLength: 3,
            dailyResetEnabled: true,
            requirePaymentBeforeComplete: true,
            receiptPrinterEnabled: false,
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .exec();
  }

  async updateSettings(
    locationId: string,
    dto: UpdateCounterSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<CounterSettingsDocument> {
    await this.accessPolicy.assertCanManageLocation(actor, locationId);
    const current = await this.getSettings(locationId, actor);

    return this.settingsModel
      .findByIdAndUpdate(
        current._id,
        {
          ...dto,
          companyId: current.companyId ?? actor.companyId,
          locationId,
        },
        { new: true, runValidators: true },
      )
      .exec()
      .then((settings) => settings ?? current);
  }

  async nextPickupNumber(
    locationId: string,
    companyId?: string,
  ): Promise<string> {
    const settings = await this.getSettings(locationId);
    const businessDate = settings.dailyResetEnabled
      ? this.businessDate(new Date())
      : 'global';
    const prefix = settings.pickupPrefix || 'A';

    const sequence = await this.sequenceModel
      .findOneAndUpdate(
        { locationId, businessDate, prefix },
        {
          $inc: { currentNumber: 1 },
          $setOnInsert: {
            companyId,
            locationId,
            businessDate,
            prefix,
            currentNumber: settings.pickupStartNumber - 1,
            minLength: settings.pickupNumberLength,
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .exec();

    const pickupNumber = `${prefix}${String(sequence.currentNumber).padStart(
      sequence.minLength,
      '0',
    )}`;

    sequence.lastPickupNumber = pickupNumber;
    await sequence.save();

    return pickupNumber;
  }

  private businessDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
