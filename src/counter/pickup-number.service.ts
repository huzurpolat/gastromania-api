import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MongoServerError } from 'mongodb';
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

    const sequence =
      (await this.incrementExistingSequence(
        locationId,
        businessDate,
        prefix,
        settings.pickupNumberLength,
        companyId,
      )) ??
      (await this.createInitialSequence(
        locationId,
        businessDate,
        prefix,
        settings.pickupStartNumber,
        settings.pickupNumberLength,
        companyId,
      ));

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

  private incrementExistingSequence(
    locationId: string,
    businessDate: string,
    prefix: string,
    minLength: number,
    companyId?: string,
  ): Promise<PickupNumberSequenceDocument | null> {
    const update: {
      $inc: { currentNumber: number };
      $set: { minLength: number; companyId?: string };
    } = {
      $inc: { currentNumber: 1 },
      $set: { minLength },
    };

    if (companyId) {
      update.$set.companyId = companyId;
    }

    return this.sequenceModel
      .findOneAndUpdate(
        { locationId, businessDate, prefix },
        update,
        { new: true, runValidators: true },
      )
      .exec();
  }

  private async createInitialSequence(
    locationId: string,
    businessDate: string,
    prefix: string,
    startNumber: number,
    minLength: number,
    companyId?: string,
  ): Promise<PickupNumberSequenceDocument> {
    try {
      return await this.sequenceModel.create({
        companyId,
        locationId,
        businessDate,
        prefix,
        currentNumber: startNumber,
        minLength,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const sequence = await this.incrementExistingSequence(
          locationId,
          businessDate,
          prefix,
          minLength,
          companyId,
        );

        if (sequence) {
          return sequence;
        }
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
  }
}
