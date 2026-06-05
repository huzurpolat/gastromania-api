import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Tenant, TenantDocument, TenantStatus } from '../tenants/schemas/tenant.schema';
import {
  DEFAULT_MODULES,
  normalizeModuleKey,
} from './constants/module-definitions';
import { CreateModuleDefinitionDto } from './dto/create-module-definition.dto';
import { UpdateModuleDefinitionDto } from './dto/update-module-definition.dto';
import {
  SystemModule,
  SystemModuleDocument,
} from './schemas/system-module.schema';
import {
  TenantModule,
  TenantModuleDocument,
} from './schemas/tenant-module.schema';

@Injectable()
export class ModulesService implements OnModuleInit {
  constructor(
    @InjectModel(SystemModule.name)
    private readonly moduleModel: Model<SystemModuleDocument>,
    @InjectModel(TenantModule.name)
    private readonly tenantModuleModel: Model<TenantModuleDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async findAll(): Promise<SystemModuleDocument[]> {
    await this.seedDefaults();

    return this.moduleModel
      .find()
      .sort({ category: 1, sortOrder: 1, name: 1 })
      .exec();
  }

  async getStatus(
    user?: AuthenticatedUser,
  ): Promise<Array<{ key: string; enabled: boolean }>> {
    await this.seedDefaults();
    const tenantId = this.resolveTenantId(user);

    if (!tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Modulstatus');
    }

    return this.getTenantStatus(tenantId);
  }

  async createDefinition(dto: CreateModuleDefinitionDto) {
    await this.seedDefaults();
    const key = normalizeModuleKey(dto.key.trim());
    const exists = await this.moduleModel.exists({ key });

    if (exists) {
      throw new ConflictException('Moduldefinition existiert bereits');
    }

    return this.moduleModel.create({
      key,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      defaultEnabled: dto.defaultEnabled,
      systemLocked: dto.systemLocked ?? false,
      sortOrder: dto.sortOrder ?? 0,
    });
  }

  async updateDefinition(key: string, dto: UpdateModuleDefinitionDto) {
    await this.seedDefaults();
    const moduleConfig = await this.findDefinition(key);

    if (!moduleConfig) {
      throw new NotFoundException('Modul nicht gefunden');
    }

    if (dto.name !== undefined) moduleConfig.name = dto.name;
    if (dto.description !== undefined) moduleConfig.description = dto.description;
    if (dto.category !== undefined) moduleConfig.category = dto.category;
    if (dto.defaultEnabled !== undefined) {
      moduleConfig.defaultEnabled = dto.defaultEnabled;
    }
    if (dto.systemLocked !== undefined) moduleConfig.systemLocked = dto.systemLocked;
    if (dto.sortOrder !== undefined) moduleConfig.sortOrder = dto.sortOrder;

    return moduleConfig.save();
  }

  async findTenantModules(tenantId: string) {
    await this.ensureTenantDefaults(tenantId);
    const definitions = await this.findAll();
    const tenantModules = await this.tenantModuleModel
      .find({ tenantId })
      .lean()
      .exec();
    const tenantStatus = new Map(
      tenantModules.map((moduleConfig) => [
        moduleConfig.moduleKey,
        moduleConfig.enabled,
      ]),
    );

    return definitions.map((definition) => ({
      _id: definition._id.toString(),
      key: definition.key,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      enabled: tenantStatus.get(definition.key) ?? definition.defaultEnabled,
      systemLocked: definition.systemLocked,
      sortOrder: definition.sortOrder,
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    }));
  }

  async updateTenantModule(
    tenantId: string,
    key: string,
    enabled: boolean,
  ): Promise<{
    key: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    systemLocked: boolean;
    sortOrder: number;
  }> {
    await this.ensureTenantDefaults(tenantId);
    const moduleConfig = await this.findDefinition(key);

    if (!moduleConfig) {
      throw new NotFoundException('Modul nicht gefunden');
    }

    if (moduleConfig.systemLocked && !enabled) {
      throw new ForbiddenException(
        'Systemkritisches Modul darf nicht deaktiviert werden',
      );
    }

    const tenantModule = await this.tenantModuleModel
      .findOneAndUpdate(
        { tenantId, moduleKey: moduleConfig.key },
        {
          $set: {
            tenantId,
            moduleKey: moduleConfig.key,
            enabled,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    return {
      key: moduleConfig.key,
      name: moduleConfig.name,
      description: moduleConfig.description,
      category: moduleConfig.category,
      enabled: tenantModule.enabled,
      systemLocked: moduleConfig.systemLocked,
      sortOrder: moduleConfig.sortOrder,
    };
  }

  async isEnabled(key: string, user?: AuthenticatedUser): Promise<boolean> {
    const normalizedKey = normalizeModuleKey(key);
    const tenantId = this.resolveTenantId(user);

    if (!tenantId) {
      return false;
    }

    await this.assertTenantOperational(tenantId);
    await this.ensureTenantDefaults(tenantId);
    const tenantModule = await this.tenantModuleModel
      .findOne({ tenantId, moduleKey: normalizedKey })
      .exec();

    return tenantModule?.enabled ?? false;
  }

  async assertEnabled(key: string, user?: AuthenticatedUser): Promise<void> {
    const normalizedKey = normalizeModuleKey(key);
    const enabled = await this.isEnabled(normalizedKey, user);

    if (!enabled) {
      throw new ForbiddenException(
        `Module ${normalizedKey} is disabled for this tenant.`,
      );
    }
  }

  async ensureTenantDefaults(tenantId: string): Promise<void> {
    await this.seedDefaults();
    await Promise.all(
      DEFAULT_MODULES.map((definition) =>
        this.tenantModuleModel
          .updateOne(
            { tenantId, moduleKey: definition.key },
            {
              $setOnInsert: {
                tenantId,
                moduleKey: definition.key,
                enabled: definition.defaultEnabled,
              },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );
  }

  private async seedDefaults(): Promise<void> {
    await Promise.all(
      DEFAULT_MODULES.map((definition) =>
        this.moduleModel
          .updateOne(
            { key: definition.key },
            {
              $set: {
                name: definition.name,
                description: definition.description,
                category: definition.category,
                defaultEnabled: definition.defaultEnabled,
                systemLocked: definition.systemLocked,
                sortOrder: definition.sortOrder,
              },
              $setOnInsert: {
                key: definition.key,
              },
            },
            { upsert: true },
          )
          .exec(),
      ),
    );
  }

  private async getTenantStatus(
    tenantId: string,
  ): Promise<Array<{ key: string; enabled: boolean }>> {
    await this.ensureTenantDefaults(tenantId);
    const modules = await this.tenantModuleModel
      .find({ tenantId }, { moduleKey: 1, enabled: 1, _id: 0 })
      .lean()
      .exec();

    return modules.map((moduleConfig) => ({
      key: moduleConfig.moduleKey,
      enabled: moduleConfig.enabled,
    }));
  }

  private async findDefinition(
    key: string,
  ): Promise<SystemModuleDocument | null> {
    return this.moduleModel.findOne({ key: normalizeModuleKey(key) }).exec();
  }

  private resolveTenantId(user?: AuthenticatedUser): string | undefined {
    return user?.tenantId;
  }

  private async assertTenantOperational(tenantId: string): Promise<void> {
    const tenant = await this.tenantModel
      .findById(tenantId)
      .select('status')
      .lean()
      .exec();

    if (
      tenant &&
      ![TenantStatus.Active, TenantStatus.Trial].includes(tenant.status)
    ) {
      throw new ForbiddenException('Tenant ist gesperrt oder gekuendigt');
    }
  }
}
