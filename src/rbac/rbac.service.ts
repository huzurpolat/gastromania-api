import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateManagedRoleDto, UpdateManagedRoleDto } from './dto/role.dto';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
} from './permissions.catalog';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { ManagedRole, ManagedRoleDocument } from './schemas/role.schema';

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(
    @InjectModel(ManagedRole.name)
    private readonly roleModel: Model<ManagedRoleDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemRoles();
  }

  async ensureSystemRoles(): Promise<void> {
    await Promise.all(
      Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([name, permissions]) =>
        this.roleModel
          .findOneAndUpdate(
            { name },
            {
              $setOnInsert: {
                name,
                description: `${name} Systemrolle`,
                isActive: true,
                isSystemRole: true,
              },
              $set: { permissions },
            },
            { new: true, upsert: true, runValidators: true },
          )
          .exec(),
      ),
    );
  }

  permissionsCatalog() {
    return PERMISSION_DEFINITIONS;
  }

  async permissionsForRoles(roleNames: string[] = []): Promise<string[]> {
    if (roleNames.includes('Super Admin')) {
      return ['*'];
    }

    const roles = await this.roleModel
      .find({ name: { $in: roleNames }, isActive: true })
      .exec();
    const permissions = roles.flatMap((role) => role.permissions ?? []);

    return [...new Set(permissions)];
  }

  async permissionsForUser(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Ungueltige Benutzer-ID');
    }

    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    return this.permissionsForRoles(user.roles);
  }

  async findRoles(): Promise<ManagedRoleDocument[]> {
    await this.ensureSystemRoles();
    return this.roleModel.find().sort({ isSystemRole: -1, name: 1 }).exec();
  }

  async createRole(
    dto: CreateManagedRoleDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ManagedRoleDocument> {
    this.assertKnownPermissions(dto.permissions ?? []);

    try {
      const role = await this.roleModel.create({
        ...dto,
        isActive: dto.isActive ?? true,
        isSystemRole: false,
        permissions: dto.permissions ?? [],
      });
      await this.writeAudit(
        actor,
        'roles.create',
        'roles',
        undefined,
        this.documentValue(role),
        role._id.toString(),
        ipAddress,
      );
      return role;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Rolle existiert bereits');
      }
      throw error;
    }
  }

  async updateRole(
    id: string,
    dto: UpdateManagedRoleDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ManagedRoleDocument> {
    this.validateObjectId(id, 'Rollen-ID');
    this.assertKnownPermissions(dto.permissions ?? []);
    const role = await this.roleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException('Rolle nicht gefunden');
    }

    if (role.isSystemRole && dto.name && dto.name !== role.name) {
      throw new ForbiddenException(
        'Systemrollen duerfen nicht umbenannt werden',
      );
    }

    const oldValue = this.documentValue(role);
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.isActive !== undefined) role.isActive = dto.isActive;
    if (dto.permissions !== undefined) role.permissions = dto.permissions;

    const saved = await role.save();
    await this.writeAudit(
      actor,
      'roles.update',
      'roles',
      oldValue,
      this.documentValue(saved),
      id,
      ipAddress,
    );
    return saved;
  }

  async deleteRole(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<void> {
    this.validateObjectId(id, 'Rollen-ID');
    const role = await this.roleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException('Rolle nicht gefunden');
    }

    if (role.isSystemRole) {
      throw new ForbiddenException(
        'Systemrollen duerfen nicht geloescht werden',
      );
    }

    const assignedUsers = await this.userModel
      .countDocuments({ roles: role.name })
      .exec();
    if (assignedUsers > 0) {
      throw new ForbiddenException('Rolle ist Benutzern zugewiesen');
    }

    await this.roleModel.findByIdAndDelete(id).exec();
    await this.writeAudit(
      actor,
      'roles.delete',
      'roles',
      this.documentValue(role),
      undefined,
      id,
      ipAddress,
    );
  }

  async setRolePermissions(
    id: string,
    permissions: string[],
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ManagedRoleDocument> {
    return this.updateRole(id, { permissions }, actor, ipAddress);
  }

  async removeRolePermission(
    id: string,
    permission: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ManagedRoleDocument> {
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Rolle nicht gefunden');
    }
    return this.setRolePermissions(
      id,
      role.permissions.filter((entry) => entry !== permission),
      actor,
      ipAddress,
    );
  }

  async auditLogs(): Promise<AuditLogDocument[]> {
    return this.auditModel.find().sort({ createdAt: -1 }).limit(250).exec();
  }

  async writeAudit(
    actor: AuthenticatedUser | undefined,
    action: string,
    module: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>,
    entityId?: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.auditModel.create({
      actorId: actor?.sub,
      actorEmail: actor?.email,
      action,
      module,
      entityId,
      oldValue,
      newValue,
      ipAddress,
    });
  }

  private assertKnownPermissions(permissions: string[]): void {
    const knownPermissions = new Set([...ALL_PERMISSIONS, '*']);
    const unknown = permissions.filter(
      (permission) => !knownPermissions.has(permission),
    );
    if (unknown.length) {
      throw new BadRequestException(
        `Unbekannte Berechtigung: ${unknown.join(', ')}`,
      );
    }
  }

  private documentValue(document: {
    toObject: () => unknown;
  }): Record<string, unknown> {
    return document.toObject() as Record<string, unknown>;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
