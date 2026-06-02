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
import { AccessPolicyService } from '../access/access-policy.service';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  toUserResponse,
  User,
  UserDocument,
  UserResponse,
} from './schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createUserDto: CreateUserDto,
    rolesOverride?: string[],
    actor?: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.assertCanManagePayload(actor, createUserDto);

    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      this.passwordSaltRounds,
    );
    const locationIds = this.getUniqueLocationIds([
      ...(createUserDto.locationIds ?? []),
      ...(createUserDto.locationId ? [createUserDto.locationId] : []),
    ]);
    const managedLocationIds = this.getUniqueLocationIds(
      createUserDto.managedLocationIds ?? [],
    );

    try {
      const user = await this.userModel.create({
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        phone: createUserDto.phone,
        mobile: createUserDto.mobile,
        taxNumber: createUserDto.taxNumber,
        vatId: createUserDto.vatId,
        taxOffice: createUserDto.taxOffice,
        employeeNumber: createUserDto.employeeNumber,
        department: createUserDto.department,
        profileImageUrl: createUserDto.profileImageUrl,
        roles: rolesOverride ?? createUserDto.roles,
        isActive: createUserDto.isActive,
        companyId: createUserDto.companyId ?? actor?.companyId,
        regionIds: createUserDto.regionIds ?? actor?.regionIds ?? [],
        locationId: createUserDto.locationId ?? locationIds[0],
        locationIds,
        managedLocationIds,
        departmentIds: createUserDto.departmentIds ?? [],
        responsibilities: createUserDto.responsibilities ?? [],
      });

      return toUserResponse(user);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Benutzer mit dieser E-Mail existiert bereits',
        );
      }

      throw error;
    }
  }

  async findAll(actor?: AuthenticatedUser): Promise<UserResponse[]> {
    const query = actor ? await this.getManageableUsersQuery(actor) : {};
    const users = await this.userModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();

    return users.map((user) => toUserResponse(user));
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async findById(id: string, actor?: AuthenticatedUser): Promise<UserResponse> {
    this.validateObjectId(id);

    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    await this.assertCanManageUser(actor, user);

    return toUserResponse(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor?: AuthenticatedUser,
  ): Promise<UserResponse> {
    this.validateObjectId(id);
    const existingUser = await this.userModel.findById(id).exec();

    if (!existingUser) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    await this.assertCanManageUser(actor, existingUser);
    await this.assertCanManagePayload(actor, updateUserDto, existingUser);

    const update: Partial<User> = {};
    const locationIds = this.getUniqueLocationIds([
      ...(updateUserDto.locationIds ?? existingUser.locationIds ?? []),
      ...((updateUserDto.locationId ?? existingUser.locationId)
        ? [updateUserDto.locationId ?? existingUser.locationId]
        : []),
    ]);

    if (updateUserDto.email !== undefined) {
      update.email = updateUserDto.email;
    }

    if (updateUserDto.firstName !== undefined) {
      update.firstName = updateUserDto.firstName;
    }

    if (updateUserDto.lastName !== undefined) {
      update.lastName = updateUserDto.lastName;
    }

    if (updateUserDto.phone !== undefined) {
      update.phone = updateUserDto.phone;
    }

    if (updateUserDto.mobile !== undefined) {
      update.mobile = updateUserDto.mobile;
    }

    if (updateUserDto.taxNumber !== undefined) {
      update.taxNumber = updateUserDto.taxNumber;
    }

    if (updateUserDto.vatId !== undefined) {
      update.vatId = updateUserDto.vatId;
    }

    if (updateUserDto.taxOffice !== undefined) {
      update.taxOffice = updateUserDto.taxOffice;
    }

    if (updateUserDto.employeeNumber !== undefined) {
      update.employeeNumber = updateUserDto.employeeNumber;
    }

    if (updateUserDto.department !== undefined) {
      update.department = updateUserDto.department;
    }

    if (updateUserDto.profileImageUrl !== undefined) {
      update.profileImageUrl = updateUserDto.profileImageUrl;
    }

    if (updateUserDto.roles !== undefined) {
      update.roles = updateUserDto.roles;
    }

    if (updateUserDto.isActive !== undefined) {
      if (
        updateUserDto.isActive === false &&
        existingUser.roles.includes(Role.SuperAdmin) &&
        (await this.countActiveSuperAdmins()) <= 1
      ) {
        throw new ForbiddenException(
          'Der letzte Super Admin darf nicht deaktiviert werden',
        );
      }
      update.isActive = updateUserDto.isActive;
    }

    if (updateUserDto.companyId !== undefined) {
      update.companyId = updateUserDto.companyId;
    }

    if (updateUserDto.regionIds !== undefined) {
      update.regionIds = updateUserDto.regionIds;
    }

    if (updateUserDto.locationId !== undefined) {
      update.locationId = updateUserDto.locationId;
    }

    if (updateUserDto.locationIds !== undefined) {
      update.locationIds = locationIds;
      update.locationId = updateUserDto.locationId ?? locationIds[0];
    }

    if (updateUserDto.managedLocationIds !== undefined) {
      update.managedLocationIds = this.getUniqueLocationIds(
        updateUserDto.managedLocationIds,
      );
    }

    if (updateUserDto.departmentIds !== undefined) {
      update.departmentIds = updateUserDto.departmentIds;
    }

    if (updateUserDto.responsibilities !== undefined) {
      update.responsibilities = updateUserDto.responsibilities;
    }

    if (updateUserDto.password !== undefined) {
      update.passwordHash = await bcrypt.hash(
        updateUserDto.password,
        this.passwordSaltRounds,
      );
    }

    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, update, { new: true })
        .exec();

      if (!user) {
        throw new NotFoundException('Benutzer nicht gefunden');
      }

      return toUserResponse(user);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Benutzer mit dieser E-Mail existiert bereits',
        );
      }

      throw error;
    }
  }

  async remove(id: string, actor?: AuthenticatedUser): Promise<void> {
    this.validateObjectId(id);

    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    await this.assertCanManageUser(actor, user);
    if (
      user.roles.includes(Role.SuperAdmin) &&
      (await this.countActiveSuperAdmins()) <= 1
    ) {
      throw new ForbiddenException(
        'Der letzte Super Admin darf nicht geloescht werden',
      );
    }
    await this.userModel.findByIdAndDelete(id).exec();
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .exec();

    return user ? toUserResponse(user) : null;
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Benutzer-ID');
    }
  }

  private async assertCanManagePayload(
    actor: AuthenticatedUser | undefined,
    payload: CreateUserDto | UpdateUserDto,
    existingUser?: UserDocument,
  ): Promise<void> {
    if (!actor) {
      return;
    }

    const scopedPayload = {
      companyId: payload.companyId ?? existingUser?.companyId,
      regionIds: payload.regionIds ?? existingUser?.regionIds ?? [],
      locationId: payload.locationId ?? existingUser?.locationId,
      locationIds: payload.locationIds ?? existingUser?.locationIds ?? [],
      managedLocationIds:
        payload.managedLocationIds ?? existingUser?.managedLocationIds ?? [],
      departmentIds: payload.departmentIds ?? existingUser?.departmentIds ?? [],
      roles: payload.roles ?? existingUser?.roles ?? [],
    };

    await this.accessPolicy.assertAssignableScope(actor, scopedPayload);

    if (existingUser) {
      await this.accessPolicy.assertCanManageUser(actor, existingUser);
    }

    const roles = payload.roles ?? existingUser?.roles ?? [];
    if (
      !roles.length ||
      roles.some((role) => !this.accessPolicy.canAssignRole(actor, role))
    ) {
      throw new ForbiddenException('Diese Rolle darf nicht vergeben werden');
    }
  }

  private async assertCanManageUser(
    actor: AuthenticatedUser | undefined,
    user: UserDocument,
  ): Promise<void> {
    if (!actor) {
      return;
    }

    await this.accessPolicy.assertCanManageUser(actor, user);
  }

  private async getManageableUsersQuery(
    actor: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.accessPolicy.getManageableUsersFilter(actor);
  }

  private async getManagerLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private countActiveSuperAdmins(): Promise<number> {
    return this.userModel
      .countDocuments({ roles: Role.SuperAdmin, isActive: true })
      .exec();
  }

  private getUniqueLocationIds(
    locationIds: Array<string | undefined>,
  ): string[] {
    return [...new Set(locationIds.filter((id): id is string => Boolean(id)))];
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
