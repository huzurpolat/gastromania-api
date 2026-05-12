import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AppSettings, AppSettingsDocument } from './schemas/app-settings.schema';

export interface SettingsResponse {
  _id: string;
  customerName?: string;
  customerNumber?: string;
  contactEmail?: string;
  locale: string;
  timezone: string;
  currency: string;
  orderPrefix: string;
  defaultTaxRate: number;
  enablePushMessages: boolean;
  allowDemoData: boolean;
  maintenanceMode: boolean;
  mongoConnectionName?: string;
  mongoHost?: string;
  mongoDatabase?: string;
  mongoUsername?: string;
  mongoAuthSource?: string;
  mongoOptions?: string;
  mongoPasswordConfigured: boolean;
  mongoPasswordUpdatedAt?: string;
  note?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class SettingsService {
  private readonly settingsKey = 'global';

  constructor(
    @InjectModel(AppSettings.name)
    private readonly settingsModel: Model<AppSettingsDocument>,
    private readonly config: ConfigService,
  ) {}

  async getSettings(): Promise<SettingsResponse> {
    const settings = await this.getOrCreateSettings();
    return this.toResponse(settings);
  }

  async updateSettings(
    payload: UpdateSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<SettingsResponse> {
    const settings = await this.getOrCreateSettings(true);
    const { mongoPassword, ...safePayload } = payload;

    settings.set({
      ...safePayload,
      updatedBy: actor.email,
    });

    if (mongoPassword) {
      settings.mongoPasswordCipher = this.encryptSecret(mongoPassword);
      settings.mongoPasswordUpdatedAt = new Date();
    }

    const saved = await settings.save();
    return this.toResponse(saved);
  }

  private async getOrCreateSettings(includeSecret = false): Promise<AppSettingsDocument> {
    const query = this.settingsModel.findOne({ key: this.settingsKey });

    if (includeSecret) {
      query.select('+mongoPasswordCipher');
    }

    const settings = await query.exec();
    if (settings) return settings;

    return this.settingsModel.create({ key: this.settingsKey });
  }

  private encryptSecret(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
  }

  private getEncryptionKey(): Buffer {
    const secret =
      this.config.get<string>('SETTINGS_ENCRYPTION_KEY') ??
      this.config.get<string>('JWT_SECRET') ??
      'local-development-settings-secret-change-me';

    return createHash('sha256').update(secret).digest();
  }

  private toResponse(settings: AppSettingsDocument): SettingsResponse {
    const timestamped = settings as AppSettingsDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };

    return {
      _id: settings._id.toString(),
      customerName: settings.customerName,
      customerNumber: settings.customerNumber,
      contactEmail: settings.contactEmail,
      locale: settings.locale,
      timezone: settings.timezone,
      currency: settings.currency,
      orderPrefix: settings.orderPrefix,
      defaultTaxRate: settings.defaultTaxRate,
      enablePushMessages: settings.enablePushMessages,
      allowDemoData: settings.allowDemoData,
      maintenanceMode: settings.maintenanceMode,
      mongoConnectionName: settings.mongoConnectionName,
      mongoHost: settings.mongoHost,
      mongoDatabase: settings.mongoDatabase,
      mongoUsername: settings.mongoUsername,
      mongoAuthSource: settings.mongoAuthSource,
      mongoOptions: settings.mongoOptions,
      mongoPasswordConfigured: Boolean(settings.mongoPasswordCipher),
      mongoPasswordUpdatedAt: settings.mongoPasswordUpdatedAt?.toISOString(),
      note: settings.note,
      updatedBy: settings.updatedBy,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }
}
