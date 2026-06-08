import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { ModulesService } from '../modules/modules.service';
import { normalizeModuleKey } from '../modules/constants/module-definitions';
import { User, UserDocument, toUserResponse } from '../users/schemas/user.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import {
  BillingStatus,
  LicenseStatus,
  Tenant,
  TenantDocument,
  TenantStatus,
} from './schemas/tenant.schema';

@Injectable()
export class TenantsService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly modulesService: ModulesService,
  ) {}

  async findAll() {
    return this.tenantModel
      .find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async create(dto: CreateTenantDto, actor: AuthenticatedUser) {
    const slug = this.normalizeSlug(dto.slug);
    const adminEmail = dto.adminEmail.toLowerCase();
    await this.validateStartModules(dto.enabledModules);

    if (await this.tenantModel.exists({ slug })) {
      throw new ConflictException('Tenant-Slug existiert bereits');
    }

    if (await this.userModel.exists({ email: adminEmail })) {
      throw new ConflictException('Admin-E-Mail existiert bereits');
    }

    const company = await this.companyModel.create({
      name: dto.name,
      slug,
      type: dto.planKey ?? 'restaurant-tenant',
      isActive: dto.status !== TenantStatus.Suspended,
    });
    const tenant = await this.tenantModel.create({
      name: dto.name,
      slug,
      status: dto.status ?? TenantStatus.Trial,
      planKey: dto.planKey,
      licenseStatus: dto.licenseStatus ?? LicenseStatus.Trial,
      billingStatus: dto.billingStatus ?? BillingStatus.Open,
      licenseValidUntil: this.parseOptionalDate(dto.licenseValidUntil),
      contactEmail: dto.contactEmail?.toLowerCase(),
      contactPhone: dto.contactPhone,
      billingName: dto.billingName,
      billingAddress: dto.billingAddress,
      companyId: company._id.toString(),
    });

    await this.modulesService.ensureTenantDefaults(tenant._id.toString());
    await this.applyStartModules(tenant._id.toString(), dto.enabledModules);

    const passwordHash = await bcrypt.hash(
      dto.adminPassword,
      this.passwordSaltRounds,
    );
    const admin = await this.userModel.create({
      email: adminEmail,
      passwordHash,
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      roles: [Role.TenantAdmin],
      tenantId: tenant._id.toString(),
      companyId: company._id.toString(),
      isActive: true,
      status: 'active',
      regionIds: [],
      locationIds: [],
      managedLocationIds: [],
      departmentIds: [],
      responsibilities: [],
    });

    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      metadata: { slug, adminUserId: admin._id.toString() },
    });
    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: 'tenant_admin.created',
      entityType: 'user',
      entityId: admin._id.toString(),
      metadata: { email: admin.email },
    });

    return {
      tenant,
      admin: toUserResponse(admin),
      modules: await this.modulesService.findTenantModules(
        tenant._id.toString(),
      ),
    };
  }

  async findOne(id: string) {
    const tenant = await this.getTenant(id);
    const admins = await this.userModel
      .find({
        tenantId: tenant._id.toString(),
        roles: { $in: [Role.TenantAdmin, Role.RestaurantAdmin, Role.CompanyAdmin, Role.Admin] },
      })
      .sort({ createdAt: 1 })
      .exec();

    return {
      tenant,
      admins: admins.map((admin) => toUserResponse(admin)),
      modules: await this.modulesService.findTenantModules(tenant._id.toString()),
    };
  }

  async update(id: string, dto: UpdateTenantDto, actor: AuthenticatedUser) {
    const tenant = await this.getTenant(id);

    if (dto.slug !== undefined) {
      const slug = this.normalizeSlug(dto.slug);
      const duplicate = await this.tenantModel.exists({
        slug,
        _id: { $ne: tenant._id },
      });
      if (duplicate) {
        throw new ConflictException('Tenant-Slug existiert bereits');
      }
      tenant.slug = slug;
    }

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.status !== undefined) tenant.status = dto.status;
    if (dto.planKey !== undefined) tenant.planKey = dto.planKey;
    if (dto.licenseStatus !== undefined) {
      tenant.licenseStatus = dto.licenseStatus;
    }
    if (dto.billingStatus !== undefined) {
      tenant.billingStatus = dto.billingStatus;
    }
    if (dto.licenseValidUntil !== undefined) {
      tenant.licenseValidUntil = this.parseOptionalDate(dto.licenseValidUntil);
    }
    if (dto.contactEmail !== undefined) {
      tenant.contactEmail = dto.contactEmail?.toLowerCase();
    }
    if (dto.contactPhone !== undefined) tenant.contactPhone = dto.contactPhone;
    if (dto.billingName !== undefined) tenant.billingName = dto.billingName;
    if (dto.billingAddress !== undefined) {
      tenant.billingAddress = dto.billingAddress;
    }

    await tenant.save();
    await this.syncCompanyStatus(tenant);
    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: 'tenant.updated',
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      metadata: { ...dto },
    });

    return tenant;
  }

  async softDelete(id: string, actor: AuthenticatedUser) {
    const tenant = await this.getTenant(id);
    tenant.status = TenantStatus.Cancelled;
    tenant.licenseStatus = LicenseStatus.Suspended;
    tenant.billingStatus = BillingStatus.Blocked;
    tenant.deletedAt = new Date();
    await tenant.save();
    await this.syncCompanyStatus(tenant);
    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: 'tenant.soft_deleted',
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      metadata: {
        status: tenant.status,
        licenseStatus: tenant.licenseStatus,
        billingStatus: tenant.billingStatus,
      },
    });

    return tenant;
  }

  async updateStatus(
    id: string,
    dto: UpdateTenantStatusDto,
    actor: AuthenticatedUser,
  ) {
    const tenant = await this.getTenant(id);
    tenant.status = dto.status;
    await tenant.save();
    await this.syncCompanyStatus(tenant);
    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: 'tenant.status_changed',
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      metadata: { status: dto.status },
    });

    return tenant;
  }

  async findTenantModules(id: string) {
    const tenant = await this.getTenant(id);
    return this.modulesService.findTenantModules(tenant._id.toString());
  }

  async updateTenantModule(
    id: string,
    moduleKey: string,
    dto: UpdateTenantModuleDto,
    actor: AuthenticatedUser,
  ) {
    const tenant = await this.getTenant(id);
    const moduleConfig = await this.modulesService.updateTenantModule(
      tenant._id.toString(),
      moduleKey,
      dto.enabled,
    );

    await this.audit(actor, {
      tenantId: tenant._id.toString(),
      action: dto.enabled ? 'tenant_module.enabled' : 'tenant_module.disabled',
      entityType: 'tenant_module',
      entityId: moduleConfig.key,
      metadata: { moduleKey: moduleConfig.key, enabled: dto.enabled },
    });

    return moduleConfig;
  }

  async getCurrentTenant(user: AuthenticatedUser) {
    const tenantId = user.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    const tenant = await this.getTenant(tenantId);

    if (![TenantStatus.Active, TenantStatus.Trial].includes(tenant.status)) {
      throw new ForbiddenException('Tenant ist gesperrt oder gekuendigt');
    }

    return tenant;
  }

  async getCurrentTenantModules(user: AuthenticatedUser) {
    const tenant = await this.getCurrentTenant(user);
    return this.modulesService.findTenantModules(tenant._id.toString());
  }

  private async applyStartModules(
    tenantId: string,
    enabledModules?: string[],
  ): Promise<void> {
    if (enabledModules === undefined) {
      return;
    }

    const enabledKeys = new Set(
      enabledModules.map((moduleKey) => normalizeModuleKey(moduleKey)),
    );
    const modules = await this.modulesService.findTenantModules(tenantId);
    await Promise.all(
      modules.map((moduleConfig) =>
        moduleConfig.systemLocked
          ? Promise.resolve()
          : this.modulesService.updateTenantModule(
              tenantId,
              moduleConfig.key,
              enabledKeys.has(moduleConfig.key),
            ),
      ),
    );
  }

  private async validateStartModules(enabledModules?: string[]): Promise<void> {
    if (enabledModules === undefined) {
      return;
    }

    const definitions = await this.modulesService.findAll();
    const knownModuleKeys = new Set(
      definitions.map((definition) => definition.key),
    );
    const invalidModuleKeys = enabledModules
      .map((key) => normalizeModuleKey(key))
      .filter((key) => !knownModuleKeys.has(key));

    if (invalidModuleKeys.length > 0) {
      throw new BadRequestException(
        `Unbekannte Module: ${[...new Set(invalidModuleKeys)].join(', ')}`,
      );
    }
  }

  private async getTenant(id: string): Promise<TenantDocument> {
    this.validateObjectId(id, 'Tenant-ID');
    const tenant = await this.tenantModel.findById(id).exec();

    if (!tenant) {
      throw new NotFoundException('Tenant nicht gefunden');
    }

    return tenant;
  }

  private async syncCompanyStatus(tenant: TenantDocument): Promise<void> {
    if (!tenant.companyId) {
      return;
    }

    await this.companyModel
      .findByIdAndUpdate(tenant.companyId, {
        isActive: ![TenantStatus.Suspended, TenantStatus.Cancelled].includes(
          tenant.status,
        ),
      })
      .exec();
  }

  private async audit(
    actor: AuthenticatedUser,
    payload: {
      tenantId?: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.auditLogModel.create({
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? 'unknown',
      tenantId: payload.tenantId,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata ?? {},
    });
  }

  private normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
  }

  private parseOptionalDate(value?: string): Date | undefined {
    if (!value?.trim()) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ungueltiges Lizenzdatum');
    }

    return date;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
