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
import { normalizeRoles } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  CreateUserDto,
  USER_LOCATION_ASSIGNMENT_ROLES,
  UserLocationAssignmentDto,
} from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  toUserResponse,
  User,
  UserDocument,
  UserResponse,
} from './schemas/user.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from './schemas/user-location-assignment.schema';

interface NormalizedLocationAssignment {
  locationId: string;
  role: string;
  isPrimary: boolean;
}

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly assignmentModel: Model<UserLocationAssignmentDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createUserDto: CreateUserDto,
    rolesOverride?: string[],
    actor?: AuthenticatedUser,
  ): Promise<UserResponse> {
    const assignedRoles = normalizeRoles(
      rolesOverride ?? createUserDto.roles ?? [Role.Service],
    );
    const tenantId = this.resolveUserTenantId(
      createUserDto.tenantId,
      assignedRoles,
      actor,
    );
    await this.assertCanManagePayload(actor, {
      ...createUserDto,
      roles: assignedRoles,
      tenantId,
    });
    await this.assertUniqueEmployeeNumber(
      createUserDto.employeeNumber,
      createUserDto.companyId ?? actor?.companyId,
    );

    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      this.passwordSaltRounds,
    );
    const locationAssignments = this.normalizeLocationAssignments(
      createUserDto.locationAssignments,
      assignedRoles,
    );
    await this.assertActorCanManageLocationAssignmentRoles(
      actor,
      locationAssignments.map((assignment) => assignment.role),
    );
    const locationIds = this.getUniqueLocationIds([
      ...(createUserDto.locationIds ?? []),
      ...(createUserDto.locationId ? [createUserDto.locationId] : []),
      ...locationAssignments.map((assignment) => assignment.locationId),
    ]);
    const managedLocationIds = this.getUniqueLocationIds(
      createUserDto.managedLocationIds ?? [],
    );
    await this.assertLocationsBelongToTenant(tenantId, [
      ...locationIds,
      ...managedLocationIds,
    ]);
    const primaryLocationId = this.resolvePrimaryLocationId(
      createUserDto.locationId,
      locationIds,
      locationAssignments,
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
        address: createUserDto.address,
        street: createUserDto.street,
        zip: createUserDto.zip,
        city: createUserDto.city,
        country: createUserDto.country,
        birthDate: createUserDto.birthDate
          ? new Date(createUserDto.birthDate)
          : undefined,
        hireDate: createUserDto.hireDate
          ? new Date(createUserDto.hireDate)
          : undefined,
        terminationDate: createUserDto.terminationDate
          ? new Date(createUserDto.terminationDate)
          : undefined,
        department: createUserDto.department,
        qualifications: createUserDto.qualifications ?? [],
        employmentType: createUserDto.employmentType,
        contractType: createUserDto.contractType,
        weeklyHours: createUserDto.weeklyHours,
        hourlyRate: createUserDto.hourlyRate,
        monthlySalary: createUserDto.monthlySalary,
        vacationDaysPerYear: createUserDto.vacationDaysPerYear,
        remainingVacationDays: createUserDto.remainingVacationDays,
        employeeStatus: createUserDto.employeeStatus,
        notes: createUserDto.notes,
        profileImageUrl: createUserDto.profileImageUrl,
        roles: assignedRoles,
        isActive: createUserDto.isActive,
        status:
          createUserDto.status ??
          (createUserDto.isActive === false ? 'disabled' : 'active'),
        tenantId,
        companyId: createUserDto.companyId ?? actor?.companyId,
        areaIds: createUserDto.areaIds ?? actor?.areaIds ?? [],
        regionIds: createUserDto.regionIds ?? actor?.regionIds ?? [],
        locationId: primaryLocationId,
        locationIds,
        managedLocationIds,
        departmentIds: createUserDto.departmentIds ?? [],
        responsibilities: createUserDto.responsibilities ?? [],
      });
      await this.syncLocationAssignments(
        user._id.toString(),
        tenantId,
        user.areaIds ?? [],
        user.regionIds ?? [],
        [...locationIds, ...managedLocationIds],
        locationAssignments,
        user.locationId,
      );
      await this.audit(actor, {
        tenantId,
        action: 'user.created',
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: {
          email: user.email,
          roles: assignedRoles,
          locationIds,
        },
      });

      return this.withLocationAssignments(toUserResponse(user), actor);
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

    return this.withLocationAssignmentsForUsers(
      users.map((user) => toUserResponse(user)),
      actor,
    );
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

    return this.withLocationAssignments(toUserResponse(user), actor);
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
    await this.assertUniqueEmployeeNumber(
      updateUserDto.employeeNumber,
      updateUserDto.companyId ?? existingUser.companyId,
      id,
    );

    const update: Partial<User> = {};
    const nextRoles = normalizeRoles(updateUserDto.roles ?? existingUser.roles);
    const nextTenantId =
      updateUserDto.tenantId !== undefined
        ? updateUserDto.tenantId
        : existingUser.tenantId;
    this.assertTenantCompatibleWithRoles(nextTenantId, nextRoles);
    const locationIdsProvided = Boolean(updateUserDto.locationIds?.length);
    const locationAssignmentsProvided = Boolean(
      updateUserDto.locationAssignments?.length,
    );
    const managedLocationIdsProvided = Boolean(
      updateUserDto.managedLocationIds?.length,
    );
    const locationScopeTouched =
      updateUserDto.locationId !== undefined ||
      locationIdsProvided ||
      locationAssignmentsProvided ||
      managedLocationIdsProvided;
    const submittedLocationAssignments =
      locationAssignmentsProvided
        ? this.normalizeLocationAssignments(
            updateUserDto.locationAssignments,
            nextRoles,
          )
        : [];
    await this.assertActorCanManageLocationAssignmentRoles(
      actor,
      submittedLocationAssignments.map((assignment) => assignment.role),
    );
    const nextLocationAssignments =
      locationAssignmentsProvided
        ? await this.mergeScopedLocationAssignments(
            actor,
            existingUser,
            submittedLocationAssignments,
          )
        : [];
    const locationIds = this.getUniqueLocationIds([
      ...(locationIdsProvided
        ? (updateUserDto.locationIds ?? [])
        : (existingUser.locationIds ?? [])),
      ...(updateUserDto.locationId ?? existingUser.locationId
        ? [updateUserDto.locationId ?? existingUser.locationId]
        : []),
      ...nextLocationAssignments.map((assignment) => assignment.locationId),
    ]);
    const primaryLocationId = this.resolvePrimaryLocationId(
      updateUserDto.locationId ?? existingUser.locationId,
      locationIds,
      nextLocationAssignments,
    );
    const managedLocationIds =
      managedLocationIdsProvided
        ? this.getUniqueLocationIds(updateUserDto.managedLocationIds ?? [])
        : this.getUniqueLocationIds(existingUser.managedLocationIds ?? []);
    if (locationScopeTouched) {
      await this.assertLocationsBelongToTenant(nextTenantId, [
        ...locationIds,
        ...managedLocationIds,
      ]);
    }

    if (updateUserDto.email !== undefined) {
      const nextEmail = updateUserDto.email.toLowerCase();
      if (nextEmail !== existingUser.email.toLowerCase()) {
        const emailExists = await this.userModel.exists({
          _id: { $ne: id },
          email: nextEmail,
        });

        if (emailExists) {
          throw new ConflictException(
            'Benutzer mit dieser E-Mail existiert bereits',
          );
        }

        update.email = nextEmail;
      }
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

    if (updateUserDto.address !== undefined) {
      update.address = updateUserDto.address;
    }

    if (updateUserDto.street !== undefined) {
      update.street = updateUserDto.street;
    }

    if (updateUserDto.zip !== undefined) {
      update.zip = updateUserDto.zip;
    }

    if (updateUserDto.city !== undefined) {
      update.city = updateUserDto.city;
    }

    if (updateUserDto.country !== undefined) {
      update.country = updateUserDto.country;
    }

    if (updateUserDto.birthDate !== undefined) {
      update.birthDate = new Date(updateUserDto.birthDate);
    }

    if (updateUserDto.hireDate !== undefined) {
      update.hireDate = new Date(updateUserDto.hireDate);
    }

    if (updateUserDto.terminationDate !== undefined) {
      update.terminationDate = new Date(updateUserDto.terminationDate);
    }

    if (updateUserDto.department !== undefined) {
      update.department = updateUserDto.department;
    }

    if (updateUserDto.qualifications !== undefined) {
      update.qualifications = updateUserDto.qualifications;
    }

    if (updateUserDto.employmentType !== undefined) {
      update.employmentType = updateUserDto.employmentType;
    }

    if (updateUserDto.contractType !== undefined) {
      update.contractType = updateUserDto.contractType;
    }

    if (updateUserDto.weeklyHours !== undefined) {
      update.weeklyHours = updateUserDto.weeklyHours;
    }

    if (updateUserDto.hourlyRate !== undefined) {
      update.hourlyRate = updateUserDto.hourlyRate;
    }

    if (updateUserDto.monthlySalary !== undefined) {
      update.monthlySalary = updateUserDto.monthlySalary;
    }

    if (updateUserDto.vacationDaysPerYear !== undefined) {
      update.vacationDaysPerYear = updateUserDto.vacationDaysPerYear;
    }

    if (updateUserDto.remainingVacationDays !== undefined) {
      update.remainingVacationDays = updateUserDto.remainingVacationDays;
    }

    if (updateUserDto.employeeStatus !== undefined) {
      update.employeeStatus = updateUserDto.employeeStatus;
    }

    if (updateUserDto.notes !== undefined) {
      update.notes = updateUserDto.notes;
    }

    if (updateUserDto.profileImageUrl !== undefined) {
      update.profileImageUrl = updateUserDto.profileImageUrl;
    }

    if (updateUserDto.roles !== undefined) {
      update.roles = nextRoles;
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

    if (updateUserDto.status !== undefined) {
      update.status = updateUserDto.status;
      if (updateUserDto.status === 'disabled') {
        update.isActive = false;
      }
    }

    if (updateUserDto.tenantId !== undefined) {
      update.tenantId = updateUserDto.tenantId;
    }

    if (updateUserDto.companyId !== undefined) {
      update.companyId = updateUserDto.companyId;
    }

    if (updateUserDto.areaIds !== undefined) {
      update.areaIds = updateUserDto.areaIds;
    }

    if (updateUserDto.regionIds !== undefined) {
      update.regionIds = updateUserDto.regionIds;
    }

    if (updateUserDto.locationId !== undefined) {
      update.locationId = primaryLocationId;
    }

    if (
      locationIdsProvided ||
      locationAssignmentsProvided
    ) {
      update.locationIds = locationIds;
      update.locationId = primaryLocationId;
    }

    if (managedLocationIdsProvided) {
      update.managedLocationIds = managedLocationIds;
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

    if (
      await this.hasPermissionScopeChanged(
        existingUser,
        nextRoles,
        updateUserDto,
        locationScopeTouched,
        locationIds,
        managedLocationIds,
        nextLocationAssignments,
        primaryLocationId,
      )
    ) {
      update.permissionsVersion =
        Math.max(existingUser.permissionsVersion ?? 1, 1) + 1;
    }

    try {
      const user = await this.userModel
        .findByIdAndUpdate(id, update, { new: true })
        .exec();

      if (!user) {
        throw new NotFoundException('Benutzer nicht gefunden');
      }
      const nextLocationIds = this.getUniqueLocationIds([
        ...(user.locationIds ?? []),
        ...(user.managedLocationIds ?? []),
        ...(user.locationId ? [user.locationId] : []),
      ]);
      const assignmentsForSync =
        locationAssignmentsProvided
          ? nextLocationAssignments
          : this.normalizeLocationAssignments(
              nextLocationIds.map((locationId) => ({
                locationId,
                role: this.resolveDefaultLocationRole(user.roles),
                isPrimary: locationId === user.locationId,
              })),
              user.roles,
            );
      await this.syncLocationAssignments(
        user._id.toString(),
        user.tenantId,
        user.areaIds ?? [],
        user.regionIds ?? [],
        nextLocationIds,
        assignmentsForSync,
        user.locationId,
      );
      await this.audit(actor, {
        tenantId: user.tenantId,
        action: 'user.updated',
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: {
          rolesChanged: updateUserDto.roles !== undefined,
          locationsChanged:
            updateUserDto.locationId !== undefined ||
            locationIdsProvided ||
            managedLocationIdsProvided ||
            locationAssignmentsProvided,
          roles: user.roles,
          locationIds: nextLocationIds,
        },
      });

      return this.withLocationAssignments(toUserResponse(user), actor);
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
    await this.assignmentModel.deleteMany({ userId: id }).exec();
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

    const assignmentLocationIds = this.getUniqueLocationIds(
      payload.locationAssignments?.map((assignment) => assignment.locationId) ??
        [],
    );
    const roles = this.getUniqueLocationIds([
      ...(payload.roles ?? existingUser?.roles ?? []),
    ]);
    const locationFieldsProvided =
      payload.locationId !== undefined ||
      payload.locationIds !== undefined ||
      payload.locationAssignments !== undefined ||
      payload.managedLocationIds !== undefined;
    const scopedLocationManager =
      this.accessPolicy.isScopedLocationManager(actor);
    const scopedLocationIds = this.getUniqueLocationIds([
      ...(payload.locationIds ??
        (scopedLocationManager &&
        !locationFieldsProvided
          ? []
          : existingUser?.locationIds ?? [])),
      ...assignmentLocationIds,
    ]);
    const scopedPayload = {
      tenantId: payload.tenantId ?? existingUser?.tenantId,
      areaIds: payload.areaIds ?? existingUser?.areaIds ?? [],
      companyId: payload.companyId ?? existingUser?.companyId,
      regionIds: payload.regionIds ?? existingUser?.regionIds ?? [],
      locationId:
        payload.locationId ??
        (scopedLocationManager ? undefined : existingUser?.locationId),
      locationIds: scopedLocationIds,
      managedLocationIds:
        payload.managedLocationIds ??
        (scopedLocationManager ? [] : existingUser?.managedLocationIds ?? []),
      departmentIds: payload.departmentIds ?? existingUser?.departmentIds ?? [],
      roles,
    };

    await this.accessPolicy.assertAssignableScope(actor, scopedPayload);

    if (existingUser) {
      await this.accessPolicy.assertCanManageUser(actor, existingUser);
    }

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

  private async assertUniqueEmployeeNumber(
    employeeNumber?: string,
    companyId?: string,
    ignoreUserId?: string,
  ): Promise<void> {
    if (!employeeNumber) {
      return;
    }

    const query: Record<string, unknown> = { employeeNumber };
    if (companyId) {
      query.companyId = companyId;
    }
    if (ignoreUserId) {
      query._id = { $ne: ignoreUserId };
    }

    const existing = await this.userModel.exists(query);
    if (existing) {
      throw new ConflictException(
        'Benutzer mit dieser Personalnummer existiert bereits',
      );
    }
  }

  private async assertLocationsBelongToTenant(
    tenantId: string | undefined,
    locationIds: string[],
  ): Promise<void> {
    const uniqueLocationIds = this.getUniqueLocationIds(locationIds);
    if (!uniqueLocationIds.length) {
      return;
    }

    if (!tenantId) {
      throw new BadRequestException(
        'Tenant-ID ist fuer Standortzuordnungen erforderlich',
      );
    }

    for (const locationId of uniqueLocationIds) {
      this.validateLocationObjectId(locationId);
    }

    const locations = await this.locationModel
      .find({ _id: { $in: uniqueLocationIds } })
      .select('_id tenantId')
      .exec();

    if (locations.length !== uniqueLocationIds.length) {
      throw new BadRequestException(
        'Mindestens ein Standort wurde nicht gefunden',
      );
    }

    const invalidLocation = locations.find(
      (location) => location.tenantId !== tenantId,
    );
    if (invalidLocation) {
      throw new ForbiddenException(
        'Standort gehoert nicht zum Tenant des Mitarbeiters',
      );
    }
  }

  private validateLocationObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Standort-ID');
    }
  }

  private getUniqueLocationIds(
    locationIds: Array<string | undefined>,
  ): string[] {
    return [...new Set(locationIds.filter((id): id is string => Boolean(id)))];
  }

  private normalizeLocationAssignments(
    assignments: UserLocationAssignmentDto[] | undefined,
    userRoles: string[] = [],
  ): NormalizedLocationAssignment[] {
    const normalized = new Map<string, NormalizedLocationAssignment>();
    const defaultRole = this.resolveDefaultLocationRole(userRoles);

    for (const assignment of assignments ?? []) {
      if (!assignment.locationId) {
        continue;
      }

      normalized.set(assignment.locationId, {
        locationId: assignment.locationId,
        role: this.normalizeLocationRole(assignment.role ?? defaultRole),
        isPrimary: assignment.isPrimary === true,
      });
    }

    const values = [...normalized.values()];
    if (values.length && !values.some((assignment) => assignment.isPrimary)) {
      values[0].isPrimary = true;
    }

    let primarySeen = false;
    for (const assignment of values) {
      if (assignment.isPrimary && !primarySeen) {
        primarySeen = true;
        continue;
      }

      assignment.isPrimary = false;
    }

    return values;
  }

  private resolvePrimaryLocationId(
    requestedLocationId: string | undefined,
    locationIds: string[],
    assignments: NormalizedLocationAssignment[],
  ): string | undefined {
    if (requestedLocationId && locationIds.includes(requestedLocationId)) {
      return requestedLocationId;
    }

    const primaryAssignment = assignments.find(
      (assignment) => assignment.isPrimary,
    );
    if (
      primaryAssignment &&
      locationIds.includes(primaryAssignment.locationId)
    ) {
      return primaryAssignment.locationId;
    }

    return locationIds[0];
  }

  private resolveDefaultLocationRole(userRoles: string[] = []): string {
    for (const role of userRoles) {
      const normalizedRole = this.normalizeLocationRole(role);
      if (normalizedRole !== Role.Staff || role === Role.Staff) {
        return normalizedRole;
      }
    }

    return Role.Staff;
  }

  private normalizeLocationRole(role?: string): string {
    if (
      role &&
      (USER_LOCATION_ASSIGNMENT_ROLES as readonly string[]).includes(role)
    ) {
      return role;
    }

    switch (role) {
      case Role.Filialleiter:
      case Role.Restaurantleiter:
      case Role.LocationManager:
        return Role.LocationManager;
      case Role.Waiter:
      case Role.Service:
        return Role.Waiter;
      case Role.Kitchen:
      case Role.Kueche:
      case 'KÃ¼che':
      case 'KÃƒÂ¼che':
      case 'KÃƒÆ’Ã‚Â¼che':
      case 'Kueche':
      case 'Küche':
        return Role.Kitchen;
      case Role.Counter:
      case Role.Theke:
      case Role.Bar:
        return Role.Counter;
      case Role.Cashier:
      case Role.Kasse:
        return Role.Cashier;
      case Role.InventoryManager:
      case Role.Lager:
        return Role.InventoryManager;
      case Role.Dishwasher:
      case Role.Tellerwaescher:
      case 'TellerwÃ¤scher':
      case 'TellerwÃƒÂ¤scher':
      case 'Tellerwaescher':
      case 'Spuelkueche':
        return Role.Dishwasher;
      default:
        return Role.Staff;
    }
  }

  private async hasPermissionScopeChanged(
    existingUser: UserDocument,
    nextRoles: string[],
    updateUserDto: UpdateUserDto,
    locationScopeTouched: boolean,
    locationIds: string[],
    managedLocationIds: string[],
    nextLocationAssignments: NormalizedLocationAssignment[],
    primaryLocationId?: string,
  ): Promise<boolean> {
    if (
      updateUserDto.roles !== undefined &&
      !this.sameStringSet(normalizeRoles(existingUser.roles), nextRoles)
    ) {
      return true;
    }

    if (
      updateUserDto.status !== undefined &&
      updateUserDto.status !== (existingUser.status ?? 'active')
    ) {
      return true;
    }

    if (
      updateUserDto.isActive !== undefined &&
      updateUserDto.isActive !== existingUser.isActive
    ) {
      return true;
    }

    if (!locationScopeTouched) {
      return false;
    }

    if (!this.sameStringSet(existingUser.locationIds ?? [], locationIds)) {
      return true;
    }

    if (
      !this.sameStringSet(
        existingUser.managedLocationIds ?? [],
        managedLocationIds,
      )
    ) {
      return true;
    }

    if ((existingUser.locationId ?? undefined) !== primaryLocationId) {
      return true;
    }

    if (updateUserDto.locationAssignments === undefined) {
      return false;
    }

    const currentAssignments = await this.assignmentModel
      .find({
        userId: existingUser._id.toString(),
        locationId: { $ne: null },
      })
      .select('locationId role isPrimary')
      .lean()
      .exec();
    const currentByLocationId = new Map(
      currentAssignments.map((assignment) => [
        assignment.locationId ?? '',
        {
          role: this.normalizeLocationRole(assignment.role),
          isPrimary: assignment.isPrimary === true,
        },
      ]),
    );

    if (currentByLocationId.size !== nextLocationAssignments.length) {
      return true;
    }

    return nextLocationAssignments.some((assignment) => {
      const current = currentByLocationId.get(assignment.locationId);

      return (
        !current ||
        current.role !== assignment.role ||
        current.isPrimary !== assignment.isPrimary
      );
    });
  }

  private sameStringSet(left: string[], right: string[]): boolean {
    const leftSet = new Set(left.filter(Boolean));
    const rightSet = new Set(right.filter(Boolean));

    if (leftSet.size !== rightSet.size) {
      return false;
    }

    return [...leftSet].every((value) => rightSet.has(value));
  }

  private async assertActorCanManageLocationAssignmentRoles(
    actor: AuthenticatedUser | undefined,
    roles: string[],
  ): Promise<void> {
    if (!actor || !this.accessPolicy.isScopedLocationManager(actor)) {
      return;
    }

    const invalidRole = roles.find(
      (role) => !this.isLocationManagerAssignableLocationRole(role),
    );

    if (invalidRole) {
      throw new ForbiddenException(
        'Filialleiter duerfen nur operative Standortrollen vergeben',
      );
    }
  }

  private async mergeScopedLocationAssignments(
    actor: AuthenticatedUser | undefined,
    existingUser: UserDocument,
    submittedAssignments: NormalizedLocationAssignment[],
  ): Promise<NormalizedLocationAssignment[]> {
    if (!actor || !this.accessPolicy.isScopedLocationManager(actor)) {
      return submittedAssignments;
    }

    const manageableLocationIds =
      await this.accessPolicy.getManageableLocationIds(actor);
    const submittedOutsideScope = submittedAssignments.find(
      (assignment) => !manageableLocationIds.includes(assignment.locationId),
    );

    if (submittedOutsideScope) {
      throw new ForbiddenException(
        'Filialleiter duerfen nur eigene Standorte zuweisen',
      );
    }

    const currentAssignments = await this.assignmentModel
      .find({
        userId: existingUser._id.toString(),
        locationId: { $ne: null },
      })
      .select('locationId role isPrimary')
      .lean()
      .exec();
    const preservedAssignments = currentAssignments
      .filter(
        (assignment) =>
          assignment.locationId &&
          !manageableLocationIds.includes(assignment.locationId),
      )
      .map((assignment) => ({
        locationId: assignment.locationId ?? '',
        role: this.normalizeLocationRole(assignment.role),
        isPrimary: assignment.isPrimary === true,
      }));

    return this.normalizeLocationAssignments(
      [...preservedAssignments, ...submittedAssignments],
      existingUser.roles,
    );
  }

  private isLocationManagerAssignableLocationRole(role: string): boolean {
    return [
      Role.Waiter,
      Role.Kitchen,
      Role.Counter,
      Role.Cashier,
      Role.InventoryManager,
      Role.Dishwasher,
      Role.Staff,
    ].includes(this.normalizeLocationRole(role) as Role);
  }

  private async withLocationAssignments(
    user: UserResponse,
    actor?: AuthenticatedUser,
  ): Promise<UserResponse> {
    const visibleLocationIds = await this.visibleAssignmentLocationIds(actor);
    const assignments = await this.assignmentModel
      .find({
        userId: user._id,
        locationId: { $ne: null },
        ...(visibleLocationIds ? { locationId: { $in: visibleLocationIds } } : {}),
      })
      .sort({ isPrimary: -1, createdAt: 1 })
      .exec();

    return {
      ...user,
      locationAssignments: assignments.map((assignment) => ({
        _id: assignment._id.toString(),
        tenantId: assignment.tenantId,
        userId: assignment.userId,
        locationId: assignment.locationId ?? '',
        role: this.normalizeLocationRole(assignment.role),
        isPrimary: assignment.isPrimary === true,
      })),
    };
  }

  private async withLocationAssignmentsForUsers(
    users: UserResponse[],
    actor?: AuthenticatedUser,
  ): Promise<UserResponse[]> {
    if (!users.length) {
      return [];
    }

    const userIds = users.map((user) => user._id);
    const visibleLocationIds = await this.visibleAssignmentLocationIds(actor);
    const assignments = await this.assignmentModel
      .find({
        userId: { $in: userIds },
        locationId: { $ne: null },
        ...(visibleLocationIds ? { locationId: { $in: visibleLocationIds } } : {}),
      })
      .sort({ isPrimary: -1, createdAt: 1 })
      .exec();
    const assignmentsByUser = new Map<
      string,
      UserResponse['locationAssignments']
    >();

    for (const assignment of assignments) {
      const rows = assignmentsByUser.get(assignment.userId) ?? [];
      rows.push({
        _id: assignment._id.toString(),
        tenantId: assignment.tenantId,
        userId: assignment.userId,
        locationId: assignment.locationId ?? '',
        role: this.normalizeLocationRole(assignment.role),
        isPrimary: assignment.isPrimary === true,
      });
      assignmentsByUser.set(assignment.userId, rows);
    }

    return users.map((user) => ({
      ...user,
      locationAssignments: assignmentsByUser.get(user._id) ?? [],
    }));
  }

  private async visibleAssignmentLocationIds(
    actor?: AuthenticatedUser,
  ): Promise<string[] | undefined> {
    if (!actor || !this.accessPolicy.isScopedLocationManager(actor)) {
      return undefined;
    }

    return this.accessPolicy.getManageableLocationIds(actor);
  }

  private async syncLocationAssignments(
    userId: string,
    tenantId: string | undefined,
    _areaIds: string[],
    _regionIds: string[],
    locationIds: string[],
    locationAssignments: NormalizedLocationAssignment[] = [],
    primaryLocationId?: string,
  ): Promise<void> {
    if (!tenantId) {
      await this.assignmentModel.deleteMany({ userId }).exec();
      return;
    }

    const uniqueLocationIds = this.getUniqueLocationIds(locationIds);
    const defaultRole = this.resolveDefaultLocationRole(
      locationAssignments.map((assignment) => assignment.role),
    );
    const primaryId = this.resolvePrimaryLocationId(
      primaryLocationId,
      uniqueLocationIds,
      locationAssignments,
    );
    await this.assignmentModel
      .deleteMany({
        userId,
      })
      .exec();
    await Promise.all(
      uniqueLocationIds.map((locationId) =>
          this.assignmentModel
            .updateOne(
              { userId, locationId },
              {
                $set: {
                  userId,
                  tenantId,
                  areaId: null,
                  regionId: null,
                  locationId,
                  role:
                    locationAssignments.find(
                      (assignment) => assignment.locationId === locationId,
                    )?.role ?? defaultRole,
                  isPrimary: locationId === primaryId,
                },
              },
              { upsert: true },
            )
            .exec(),
        ),
    );
  }

  private async audit(
    actor: AuthenticatedUser | undefined,
    payload: {
      tenantId?: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!actor) {
      return;
    }

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

  private resolveUserTenantId(
    requestedTenantId: string | undefined,
    roles: string[],
    actor?: AuthenticatedUser,
  ): string | undefined {
    const tenantId = requestedTenantId ?? actor?.tenantId;

    this.assertTenantCompatibleWithRoles(tenantId, roles);

    if (
      actor &&
      tenantId &&
      actor.tenantId &&
      tenantId !== actor.tenantId &&
      !this.isPlatformRole(actor.roles)
    ) {
      throw new ForbiddenException('Benutzer muss im eigenen Tenant liegen');
    }

    return tenantId;
  }

  private assertTenantCompatibleWithRoles(
    tenantId: string | undefined,
    roles: string[],
  ): void {
    if (this.isPlatformRole(roles)) {
      if (tenantId) {
        throw new BadRequestException(
          'Platform Admins und Super Admins duerfen keinem Tenant zugeordnet sein',
        );
      }

      return;
    }

    if (!tenantId) {
      throw new BadRequestException(
        'Tenant-ID ist fuer Benutzer zwingend erforderlich',
      );
    }
  }

  private isPlatformRole(roles: string[] | undefined): boolean {
    return Boolean(
      roles?.some((role) =>
        [Role.PlatformAdmin, Role.SuperAdmin].includes(role as Role),
      ),
    );
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
