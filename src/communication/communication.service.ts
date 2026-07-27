import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  CreateCommunicationProviderDto,
  UpdateCommunicationProviderDto,
} from './dto/communication-provider.dto';
import {
  CommunicationProvider,
  CommunicationProviderDocument,
} from './schemas/communication-provider.schema';

const SECRET_KEY_PATTERN = /(key|secret|token|password|credential)/i;

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel(CommunicationProvider.name)
    private readonly providerModel: Model<CommunicationProviderDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listProviders(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    const providers = await this.providerModel
      .find({ tenantId: actor.tenantId })
      .sort({ type: 1, provider: 1, name: 1 })
      .lean();

    return providers.map((provider) => this.maskProvider(provider));
  }

  async createProvider(
    payload: CreateCommunicationProviderDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    const provider = await this.providerModel.create({
      ...payload,
      tenantId: actor.tenantId,
      active: payload.active ?? true,
      config: this.sanitizeConfig(payload.config),
    });

    return this.maskProvider(provider.toObject());
  }

  async updateProvider(
    id: string,
    payload: UpdateCommunicationProviderDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    const existing = await this.getProviderOrThrow(id, actor);
    const updated = await this.providerModel
      .findByIdAndUpdate(
        existing._id,
        {
          ...payload,
          config: payload.config
            ? this.sanitizeConfig(payload.config)
            : payload.config,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Provider nicht gefunden');
    }

    return this.maskProvider(updated);
  }

  async deleteProvider(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const provider = await this.getProviderOrThrow(id, actor);
    provider.active = false;
    await provider.save();
    return this.maskProvider(provider.toObject());
  }

  sanitizeConfig(config: Record<string, unknown> | undefined) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config ?? {})) {
      if (key === 'secretEnvVar') {
        sanitized[key] = value;
        continue;
      }
      if (SECRET_KEY_PATTERN.test(key)) {
        sanitized[`${key}Masked`] = value ? '********' : '';
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }

  maskProvider(provider: CommunicationProvider & { _id?: unknown }) {
    return {
      ...provider,
      config: this.sanitizeConfig(provider.config),
    };
  }

  private async getProviderOrThrow(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltiger Provider');
    }
    const provider = await this.providerModel.findOne({
      _id: id,
      tenantId: actor.tenantId,
    });
    if (!provider) {
      throw new NotFoundException('Provider nicht gefunden');
    }
    return provider;
  }

  private assertTenant(actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Kommunikation');
    }
  }

  private assertCanManage(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Nur Tenant Admin darf Provider verwalten');
    }
  }
}
