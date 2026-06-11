import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import { Role } from '../auth/enums/role.enum';
import { normalizeRoles } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateDepartmentDto,
  UpdateDepartmentStatusDto,
} from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department, DepartmentDocument } from './schemas/department.schema';

export interface TenantDepartmentResponse {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  employeeCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const DEFAULT_TENANT_DEPARTMENTS = [
  'Management',
  'Service',
  'Kueche',
  'Theke',
  'Kasse',
  'Lager',
  'Reinigung',
];

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    dto: CreateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentDocument> {
    if (!dto.companyId || !dto.locationId || !dto.type) {
      throw new BadRequestException(
        'companyId, locationId und type sind fuer Standort-Abteilungen erforderlich',
      );
    }

    await this.accessPolicy.assertCanManageLocation(actor, dto.locationId);
    await this.accessPolicy.assertAssignableScope(actor, {
      companyId: dto.companyId,
      locationId: dto.locationId,
    });

    const department = await this.departmentModel
      .findOneAndUpdate(
        {
          companyId: dto.companyId,
          locationId: dto.locationId,
          type: dto.type,
        },
        {
          $set: {
            ...dto,
            nameKey: this.normalizeName(dto.name),
            isActive: dto.isActive ?? true,
          },
        },
        { returnDocument: 'after', upsert: true, runValidators: true },
      )
      .exec();

    if (!department) {
      throw new NotFoundException('Department nicht gefunden');
    }

    return department;
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<DepartmentDocument[]> {
    const filter = await this.accessPolicy.getScopedResourceFilter(
      actor,
      locationId,
    );

    return this.departmentModel.find(filter).sort({ name: 1 }).exec();
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<DepartmentDocument> {
    const department = await this.departmentModel.findById(id).exec();

    if (!department) {
      throw new NotFoundException('Department nicht gefunden');
    }

    await this.accessPolicy.assertCanManageLocation(actor, department.locationId);

    if (dto.locationId) {
      await this.accessPolicy.assertCanManageLocation(actor, dto.locationId);
    }

    department.set({
      ...dto,
      ...(dto.name ? { nameKey: this.normalizeName(dto.name) } : {}),
    });
    return department.save();
  }

  async findTenantDepartments(
    actor: AuthenticatedUser,
  ): Promise<TenantDepartmentResponse[]> {
    const tenantId = this.getTenantId(actor);
    await this.ensureDefaultTenantDepartments(tenantId);

    const allDepartments = await this.departmentModel
      .find({ tenantId })
      .sort({ sortOrder: 1, name: 1 })
      .exec();

    const departments = this.canSeeAllTenantDepartments(actor)
      ? allDepartments
      : allDepartments.filter((department) =>
          (actor.departmentIds ?? []).includes(department._id.toString()),
        );

    return this.toTenantResponses(departments, tenantId);
  }

  async createTenantDepartment(
    dto: CreateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<TenantDepartmentResponse> {
    const tenantId = this.getTenantId(actor);
    this.assertTenantDepartmentManager(actor);
    const name = this.cleanName(dto.name);
    const nameKey = this.normalizeName(name);
    await this.assertUniqueTenantDepartmentName(tenantId, nameKey);

    const department = await this.departmentModel.create({
      tenantId,
      name,
      nameKey,
      description: this.cleanOptional(dto.description),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await this.audit(actor, {
      tenantId,
      action: 'department.created',
      entityId: department._id.toString(),
      metadata: {
        name: department.name,
        description: department.description,
        sortOrder: department.sortOrder ?? 0,
        isActive: department.isActive,
      },
    });

    const [response] = await this.toTenantResponses([department], tenantId);
    return response;
  }

  async updateTenantDepartment(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
  ): Promise<TenantDepartmentResponse> {
    const tenantId = this.getTenantId(actor);
    this.assertTenantDepartmentManager(actor);
    const department = await this.findTenantDepartmentDocument(id, tenantId);
    const oldValues = this.pickTenantDepartmentValues(department);

    if (dto.name !== undefined) {
      const name = this.cleanName(dto.name);
      const nameKey = this.normalizeName(name);
      if (nameKey !== department.nameKey) {
        await this.assertUniqueTenantDepartmentName(tenantId, nameKey, id);
      }
      department.name = name;
      department.nameKey = nameKey;
    }
    if (dto.description !== undefined) {
      department.description = this.cleanOptional(dto.description);
    }
    if (dto.sortOrder !== undefined) {
      department.sortOrder = dto.sortOrder;
    }

    const saved = await department.save();
    await this.audit(actor, {
      tenantId,
      action: 'department.updated',
      entityId: saved._id.toString(),
      metadata: {
        oldValues,
        newValues: this.pickTenantDepartmentValues(saved),
      },
    });

    const [response] = await this.toTenantResponses([saved], tenantId);
    return response;
  }

  async updateTenantDepartmentStatus(
    id: string,
    dto: UpdateDepartmentStatusDto,
    actor: AuthenticatedUser,
  ): Promise<TenantDepartmentResponse> {
    const tenantId = this.getTenantId(actor);
    this.assertTenantDepartmentManager(actor);
    const department = await this.findTenantDepartmentDocument(id, tenantId);
    const previousStatus = department.isActive;

    department.isActive = dto.isActive;
    const saved = await department.save();
    await this.audit(actor, {
      tenantId,
      action: dto.isActive
        ? 'department.activated'
        : 'department.deactivated',
      entityId: saved._id.toString(),
      metadata: {
        oldValues: { isActive: previousStatus },
        newValues: { isActive: saved.isActive },
      },
    });

    const [response] = await this.toTenantResponses([saved], tenantId);
    return response;
  }

  async ensureDefaultTenantDepartments(
    tenantId: string,
  ): Promise<DepartmentDocument[]> {
    await Promise.all(
      DEFAULT_TENANT_DEPARTMENTS.map((name, index) =>
        this.departmentModel
          .updateOne(
            { tenantId, nameKey: this.normalizeName(name) },
            {
              $setOnInsert: {
                tenantId,
                name,
                nameKey: this.normalizeName(name),
                sortOrder: (index + 1) * 10,
                isActive: true,
              },
            },
            { upsert: true, runValidators: true },
          )
          .exec(),
      ),
    );

    return this.departmentModel.find({ tenantId }).sort({ sortOrder: 1, name: 1 }).exec();
  }

  private async toTenantResponses(
    departments: DepartmentDocument[],
    tenantId: string,
  ): Promise<TenantDepartmentResponse[]> {
    const departmentIds = departments.map((department) => department._id.toString());
    const counts = await this.userModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            tenantId,
            departmentIds: { $in: departmentIds },
          },
        },
        { $unwind: '$departmentIds' },
        {
          $match: {
            departmentIds: { $in: departmentIds },
          },
        },
        {
          $group: {
            _id: '$departmentIds',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();
    const countByDepartment = new Map(
      counts.map((count) => [count._id, count.count]),
    );

    return departments.map((department) => ({
      _id: department._id.toString(),
      tenantId,
      name: department.name,
      description: department.description,
      sortOrder: department.sortOrder ?? 0,
      isActive: department.isActive,
      employeeCount: countByDepartment.get(department._id.toString()) ?? 0,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    }));
  }

  private async findTenantDepartmentDocument(
    id: string,
    tenantId: string,
  ): Promise<DepartmentDocument> {
    const department = await this.departmentModel.findOne({ _id: id, tenantId }).exec();

    if (!department) {
      throw new NotFoundException('Abteilung nicht gefunden');
    }

    return department;
  }

  private async assertUniqueTenantDepartmentName(
    tenantId: string,
    nameKey: string,
    ignoredId?: string,
  ): Promise<void> {
    const existing = await this.departmentModel
      .findOne({
        tenantId,
        nameKey,
        ...(ignoredId ? { _id: { $ne: ignoredId } } : {}),
      })
      .select('_id')
      .exec();

    if (existing) {
      throw new BadRequestException('Abteilung existiert bereits');
    }
  }

  private getTenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }
    return actor.tenantId;
  }

  private assertTenantDepartmentManager(actor: AuthenticatedUser): void {
    if (
      this.hasAnyRole(actor, [
        Role.PlatformAdmin,
        Role.PlatformAdminCode,
        Role.SuperAdmin,
      ])
    ) {
      throw new ForbiddenException(
        'Platform Admins verwalten keine operativen Abteilungen',
      );
    }
    if (
      !this.hasAnyRole(actor, [
        Role.TenantAdmin,
        Role.TenantAdminCode,
        Role.RestaurantAdmin,
        Role.CompanyAdmin,
        Role.Admin,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer Abteilungen');
    }
  }

  private canSeeAllTenantDepartments(actor: AuthenticatedUser): boolean {
    return this.hasAnyRole(actor, [
      Role.TenantAdmin,
      Role.TenantAdminCode,
      Role.RestaurantAdmin,
      Role.CompanyAdmin,
      Role.Admin,
      Role.RegionAdmin,
      Role.Regionalleiter,
      Role.Bereichsleiter,
      Role.LocationManager,
      Role.Filialleiter,
      Role.Restaurantleiter,
    ]);
  }

  private hasAnyRole(actor: AuthenticatedUser, roles: Role[]): boolean {
    const actorRoles = new Set(normalizeRoles(actor.roles ?? []));
    return normalizeRoles(roles).some((role) => actorRoles.has(role));
  }

  private pickTenantDepartmentValues(
    department: DepartmentDocument,
  ): Record<string, unknown> {
    return {
      name: department.name,
      description: department.description,
      sortOrder: department.sortOrder ?? 0,
      isActive: department.isActive,
    };
  }

  private cleanName(value: string): string {
    const name = value.trim();
    if (!name) {
      throw new BadRequestException('Name ist erforderlich');
    }
    return name;
  }

  private cleanOptional(value?: string): string | undefined {
    const cleaned = value?.trim();
    return cleaned || undefined;
  }

  private normalizeName(value: string): string {
    return value.trim().toLowerCase();
  }

  private async audit(
    actor: AuthenticatedUser,
    payload: {
      tenantId: string;
      action: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.auditLogModel.create({
      actorUserId: actor.sub,
      actorRole: actor.roles[0] ?? 'unknown',
      tenantId: payload.tenantId,
      action: payload.action,
      entityType: 'department',
      entityId: payload.entityId,
      metadata: payload.metadata ?? {},
    });
  }
}
