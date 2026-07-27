import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import {
  hasAnyRole as hasAnyNormalizedRole,
  normalizeRoles,
} from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  Department,
  DepartmentDocument,
} from '../departments/schemas/department.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export interface AssignableScope {
  tenantId?: string;
  companyId?: string;
  areaIds?: string[];
  regionIds?: string[];
  locationId?: string;
  locationIds?: string[];
  managedLocationIds?: string[];
  departmentIds?: string[];
  roles?: string[];
}

@Injectable()
export class AccessPolicyService {
  constructor(
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  isPlatformAdmin(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [Role.PlatformAdmin, Role.SuperAdmin]);
  }

  isCompanyAdmin(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [
      Role.TenantAdmin,
      Role.RestaurantAdmin,
      Role.CompanyAdmin,
      Role.Admin,
    ]);
  }

  isRegionAdmin(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [Role.RegionAdmin]);
  }

  isBereichsleiter(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [Role.Bereichsleiter]);
  }

  isScopedLocationManager(user?: AuthenticatedUser): boolean {
    return Boolean(
      user &&
        !this.isPlatformAdmin(user) &&
        !this.isCompanyAdmin(user) &&
        !this.isRegionAdmin(user) &&
        !this.hasAnyRole(user, [Role.Regionalleiter, Role.Bereichsleiter]) &&
        this.getLocationManagerAssignmentIds(user).length,
    );
  }

  isManagementRole(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [
      Role.TenantAdmin,
      Role.RestaurantAdmin,
      Role.CompanyAdmin,
      Role.RegionAdmin,
      Role.Admin,
      Role.Regionalleiter,
      Role.Bereichsleiter,
      Role.Filialleiter,
      Role.Restaurantleiter,
    ]);
  }

  async getReadableLocationIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.isPlatformAdmin(user)) {
      return this.findLocationIds({});
    }

    const directIds = this.unique([
      ...(user.locationIds ?? []),
      ...(user.managedLocationIds ?? []),
    ]);

    if (this.isCompanyAdmin(user) && user.tenantId) {
      return this.unique([
        ...directIds,
        ...(await this.findLocationIds({ tenantId: user.tenantId })),
      ]);
    }

    if (this.isCompanyAdmin(user) && user.companyId) {
      return this.unique([
        ...directIds,
        ...(await this.findLocationIds({ companyId: user.companyId })),
      ]);
    }

    if (
      this.isBereichsleiter(user) &&
      user.areaIds?.length
    ) {
      return this.unique([
        ...directIds,
        ...(await this.findLocationIds({ areaId: { $in: user.areaIds } })),
      ]);
    }

    if (
      (this.isRegionAdmin(user) ||
        this.hasAnyRole(user, [Role.Regionalleiter])) &&
      user.regionIds?.length
    ) {
      return this.unique([
        ...directIds,
        ...(await this.findLocationIds({ regionId: { $in: user.regionIds } })),
      ]);
    }

    if (
      this.isBereichsleiter(user) ||
      this.hasAnyRole(user, [Role.Filialleiter, Role.Restaurantleiter])
    ) {
      return directIds;
    }

    return this.unique(user.locationIds ?? []);
  }

  async getManageableLocationIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.isScopedLocationManager(user)) {
      return this.getLocationManagerAssignmentIds(user);
    }

    if (
      this.isPlatformAdmin(user) ||
      this.isCompanyAdmin(user) ||
      this.isRegionAdmin(user) ||
      this.hasAnyRole(user, [Role.Regionalleiter])
    ) {
      return this.getReadableLocationIds(user);
    }

    const managedLocationIds = this.unique(user.managedLocationIds ?? []);

    if (managedLocationIds.length) {
      return managedLocationIds;
    }

    if (
      this.isBereichsleiter(user) ||
      this.hasAnyRole(user, [Role.Filialleiter, Role.Restaurantleiter])
    ) {
      return this.unique(user.locationIds ?? []);
    }

    return [];
  }

  async getReadableLocationFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    if (this.isPlatformAdmin(user)) {
      return {};
    }

    const locationIds = await this.getReadableLocationIds(user);

    return locationIds.length
      ? { _id: { $in: locationIds } }
      : { _id: { $in: [] } };
  }

  async getScopedResourceFilter(
    user: AuthenticatedUser,
    requestedLocationId?: string,
  ): Promise<Record<string, unknown>> {
    if (requestedLocationId) {
      await this.assertCanAccessLocation(user, requestedLocationId);
      return { locationId: requestedLocationId };
    }

    if (this.isPlatformAdmin(user)) {
      return {};
    }

    const locationIds = await this.getReadableLocationIds(user);

    return { locationId: { $in: locationIds } };
  }

  async getManageableUsersFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    if (this.isPlatformAdmin(user)) {
      return {};
    }

    if (this.isCompanyAdmin(user)) {
      if (user.tenantId) {
        return { tenantId: user.tenantId };
      }

      return user.companyId
        ? { companyId: user.companyId }
        : { _id: { $in: [] } };
    }

    if (
      this.isRegionAdmin(user) ||
      this.hasAnyRole(user, [Role.Regionalleiter])
    ) {
      return user.regionIds?.length
        ? { regionIds: { $in: user.regionIds } }
        : { _id: { $in: [] } };
    }

    if (this.isBereichsleiter(user)) {
      return user.areaIds?.length
        ? { areaIds: { $in: user.areaIds } }
        : { _id: { $in: [] } };
    }

    const locationIds = this.isScopedLocationManager(user)
      ? await this.getManageableLocationIds(user)
      : await this.getReadableLocationIds(user);
    if (locationIds.length) {
      return {
        tenantId: user.tenantId,
        $or: [
          { locationId: { $in: locationIds } },
          { locationIds: { $in: locationIds } },
          { managedLocationIds: { $in: locationIds } },
        ],
      };
    }

    return { _id: { $in: [] } };
  }

  canAccessCompany(user: AuthenticatedUser, companyId?: string): boolean {
    if (!companyId || this.isPlatformAdmin(user)) {
      return true;
    }

    return Boolean(user.companyId) && user.companyId === companyId;
  }

  async canAccessRegion(
    user: AuthenticatedUser,
    regionId?: string,
  ): Promise<boolean> {
    if (!regionId || this.isPlatformAdmin(user)) {
      return true;
    }

    if (user.regionIds?.includes(regionId)) {
      return true;
    }

    const region = await this.regionModel
      .findById(regionId)
      .select('tenantId companyId areaId')
      .exec();

    if (!region) {
      return false;
    }

    if (user.areaIds?.includes(region.areaId ?? '')) {
      return true;
    }

    if (this.isCompanyAdmin(user) && user.tenantId) {
      return region.tenantId === user.tenantId;
    }

    if (this.isCompanyAdmin(user) && user.companyId) {
      return region.companyId === user.companyId;
    }

    return false;
  }

  async canAccessArea(
    user: AuthenticatedUser,
    areaId?: string,
  ): Promise<boolean> {
    if (!areaId || this.isPlatformAdmin(user)) {
      return true;
    }

    if (user.areaIds?.includes(areaId)) {
      return true;
    }

    if (!this.isCompanyAdmin(user) || !user.tenantId) {
      return false;
    }

    const area = await this.areaModel
      .findById(areaId)
      .select('tenantId')
      .exec();

    return area?.tenantId === user.tenantId;
  }

  async canAccessLocation(
    user: AuthenticatedUser,
    locationId?: string,
  ): Promise<boolean> {
    if (!locationId || this.isPlatformAdmin(user)) {
      return true;
    }

    const locationIds = await this.getReadableLocationIds(user);

    return locationIds.includes(locationId);
  }

  async canManageLocation(
    user: AuthenticatedUser,
    locationId?: string,
  ): Promise<boolean> {
    if (!locationId || this.isPlatformAdmin(user)) {
      return true;
    }

    const locationIds = await this.getManageableLocationIds(user);

    return locationIds.includes(locationId);
  }

  async canAssignLocation(
    user: AuthenticatedUser,
    locationId?: string,
  ): Promise<boolean> {
    return this.canManageLocation(user, locationId);
  }

  async canAssignDepartment(
    user: AuthenticatedUser,
    departmentId?: string,
  ): Promise<boolean> {
    if (!departmentId || this.isPlatformAdmin(user)) {
      return true;
    }

    const department = await this.departmentModel
      .findById(departmentId)
      .select('tenantId companyId locationId')
      .exec();

    if (!department) {
      return false;
    }

    if (department.tenantId) {
      return user.tenantId === department.tenantId;
    }

    if (!department.companyId || !department.locationId) {
      return false;
    }

    return (
      this.canAccessCompany(user, department.companyId) &&
      (await this.canAssignLocation(user, department.locationId))
    );
  }

  canAssignRole(user: AuthenticatedUser, role: string): boolean {
    const normalizedRole = normalizeRoles([role])[0];

    if (this.isScopedLocationManager(user)) {
      return this.locationManagerAssignableRoles().includes(
        normalizedRole as Role,
      );
    }

    if (this.isPlatformAdmin(user)) {
      return !this.platformRoles().includes(normalizedRole);
    }

    if (this.platformRoles().includes(normalizedRole)) {
      return false;
    }

    if (this.isCompanyAdmin(user)) {
      return true;
    }

    if (this.isRegionAdmin(user)) {
      return [
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        ...this.operationalRoles(),
      ].includes(normalizedRole as Role);
    }

    if (this.hasAnyRole(user, [Role.Regionalleiter])) {
      return [
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        ...this.operationalRoles(),
      ].includes(normalizedRole as Role);
    }

    if (this.isBereichsleiter(user)) {
      return [
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        ...this.operationalRoles(),
      ].includes(normalizedRole as Role);
    }

    if (this.hasAnyRole(user, [Role.Filialleiter, Role.Restaurantleiter])) {
      return [Role.Schichtleiter, ...this.operationalRoles()].includes(
        normalizedRole as Role,
      );
    }

    return false;
  }

  async canManageUser(
    actor: AuthenticatedUser,
    target: Pick<
      UserDocument,
      | 'roles'
      | 'tenantId'
      | 'companyId'
      | 'areaIds'
      | 'regionIds'
      | 'locationId'
      | 'locationIds'
      | 'managedLocationIds'
    >,
  ): Promise<boolean> {
    if (this.isPlatformAdmin(actor)) {
      return true;
    }

    const targetRoles = normalizeRoles(target.roles ?? []);
    if (
      targetRoles.some((role) => this.platformRoles().includes(role)) ||
      !targetRoles.every((role) => this.canAssignRole(actor, role))
    ) {
      return false;
    }

    const targetLocationIds = this.getScopeLocationIds(target);
    const readableLocationIds = await this.getReadableLocationIds(actor);
    const manageableLocationIds = await this.getManageableLocationIds(actor);
    const sharesLocation =
      targetLocationIds.length > 0 &&
      targetLocationIds.every((locationId) =>
        readableLocationIds.includes(locationId),
      );
    const locationManagerScoped = this.isScopedLocationManager(actor);
    const manageableLocation =
      targetLocationIds.length > 0 &&
      (locationManagerScoped
        ? targetLocationIds.some((locationId) =>
            manageableLocationIds.includes(locationId),
          )
        : targetLocationIds.every((locationId) =>
            manageableLocationIds.includes(locationId),
          ));
    const sharesRegion =
      Boolean(actor.regionIds?.length) &&
      Boolean(target.regionIds?.length) &&
      (target.regionIds ?? []).every((regionId) =>
        actor.regionIds?.includes(regionId),
      );
    const sharesArea =
      Boolean(actor.areaIds?.length) &&
      Boolean(target.areaIds?.length) &&
      (target.areaIds ?? []).every((areaId) =>
        actor.areaIds?.includes(areaId),
      );
    const sharesCompany =
      Boolean(actor.companyId) && target.companyId === actor.companyId;
    const sharesTenant =
      Boolean(actor.tenantId) && target.tenantId === actor.tenantId;

    if (this.isCompanyAdmin(actor)) {
      return sharesTenant || sharesCompany;
    }

    if (this.isRegionAdmin(actor)) {
      return sharesRegion || sharesLocation;
    }

    if (this.hasAnyRole(actor, [Role.Regionalleiter])) {
      return sharesRegion || sharesLocation;
    }

    if (this.isBereichsleiter(actor)) {
      return sharesArea || manageableLocation;
    }

    if (this.hasAnyRole(actor, [Role.Filialleiter, Role.Restaurantleiter])) {
      return manageableLocation;
    }

    return false;
  }

  async assertCanAccessLocation(
    user: AuthenticatedUser,
    locationId?: string,
  ): Promise<void> {
    if (!(await this.canAccessLocation(user, locationId))) {
      throw new ForbiddenException('Kein Zugriff auf diesen Standort');
    }
  }

  async assertCanManageLocation(
    user: AuthenticatedUser,
    locationId?: string,
  ): Promise<void> {
    if (!(await this.canManageLocation(user, locationId))) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Standort');
    }
  }

  async assertCanManageUser(
    actor: AuthenticatedUser,
    target: UserDocument,
  ): Promise<void> {
    if (!(await this.canManageUser(actor, target))) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Benutzer');
    }
  }

  async assertAssignableScope(
    actor: AuthenticatedUser,
    payload: AssignableScope,
  ): Promise<void> {
    if (
      payload.tenantId &&
      !this.isPlatformAdmin(actor) &&
      payload.tenantId !== actor.tenantId
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Tenant');
    }

    if (payload.companyId && !this.canAccessCompany(actor, payload.companyId)) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer dieses Unternehmen',
      );
    }

    for (const areaId of payload.areaIds ?? []) {
      if (!(await this.canAccessArea(actor, areaId))) {
        throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
      }
    }

    for (const regionId of payload.regionIds ?? []) {
      if (!(await this.canAccessRegion(actor, regionId))) {
        throw new ForbiddenException('Keine Berechtigung fuer diese Region');
      }
    }

    for (const locationId of this.getPayloadLocationIds(payload)) {
      if (!(await this.canAssignLocation(actor, locationId))) {
        throw new ForbiddenException('Keine Berechtigung fuer diesen Standort');
      }
    }

    for (const departmentId of payload.departmentIds ?? []) {
      if (!(await this.canAssignDepartment(actor, departmentId))) {
        throw new ForbiddenException(
          'Keine Berechtigung fuer dieses Department',
        );
      }
    }

    for (const role of payload.roles ?? []) {
      if (!this.canAssignRole(actor, role)) {
        throw new ForbiddenException('Diese Rolle darf nicht vergeben werden');
      }
    }
  }

  async assertLocationExistsAndReadable(
    user: AuthenticatedUser,
    locationId: string,
  ): Promise<LocationDocument> {
    this.validateObjectId(locationId, 'Standort-ID');
    const location = await this.locationModel.findById(locationId).exec();

    if (!location || !(await this.canAccessLocation(user, locationId))) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return location;
  }

  async assertCompanyExists(companyId: string): Promise<void> {
    this.validateObjectId(companyId, 'Unternehmens-ID');
    const company = await this.companyModel.exists({ _id: companyId });

    if (!company) {
      throw new BadRequestException('Unternehmen existiert nicht');
    }
  }

  async assertRegionExists(regionId: string): Promise<void> {
    this.validateObjectId(regionId, 'Regions-ID');
    const region = await this.regionModel.exists({ _id: regionId });

    if (!region) {
      throw new BadRequestException('Region existiert nicht');
    }
  }

  async assertAreaExists(areaId: string): Promise<void> {
    this.validateObjectId(areaId, 'Bereichs-ID');
    const area = await this.areaModel.exists({ _id: areaId });

    if (!area) {
      throw new BadRequestException('Bereich existiert nicht');
    }
  }

  private async findLocationIds(
    filter: Record<string, unknown>,
  ): Promise<string[]> {
    const locations = await this.locationModel
      .find(filter)
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private getPayloadLocationIds(payload: AssignableScope): string[] {
    return this.unique([
      ...(payload.locationIds ?? []),
      ...(payload.managedLocationIds ?? []),
      ...(payload.locationId ? [payload.locationId] : []),
    ]);
  }

  private getScopeLocationIds(
    user: Pick<
      UserDocument,
      'locationId' | 'locationIds' | 'managedLocationIds'
    >,
  ): string[] {
    return this.unique([
      ...(user.locationIds ?? []),
      ...(user.managedLocationIds ?? []),
      ...(user.locationId ? [user.locationId] : []),
    ]);
  }

  private hasAnyRole(
    user: AuthenticatedUser | undefined,
    roles: Role[],
  ): boolean {
    return hasAnyNormalizedRole(user?.roles, roles);
  }

  private platformRoles(): string[] {
    return [Role.PlatformAdmin, Role.SuperAdmin];
  }

  private getLocationManagerAssignmentIds(user: AuthenticatedUser): string[] {
    return this.unique([
      ...(user.locationAssignments ?? [])
        .filter((assignment) =>
          [Role.LocationManager, Role.Filialleiter].includes(
            assignment.role as Role,
          ),
        )
        .map((assignment) => assignment.locationId),
      ...(user.managedLocationIds ?? []),
    ]);
  }

  private locationManagerAssignableRoles(): Role[] {
    return [
      Role.Service,
      Role.Kueche,
      Role.Theke,
      Role.Kasse,
      Role.Lager,
      Role.Dishwasher,
      Role.Tellerwaescher,
      Role.Staff,
    ];
  }

  private operationalRoles(): Role[] {
    return [
      Role.Service,
      Role.Kueche,
      Role.Bar,
      Role.Theke,
      Role.Kasse,
      Role.Lager,
      Role.Dishwasher,
      Role.Einkauf,
      Role.Buchhaltung,
      Role.Marketing,
      Role.Personalabteilung,
      Role.Reinigung,
      Role.Eventmanager,
      Role.Kunde,
      Role.Tellerwaescher,
      Role.Staff,
    ];
  }

  private unique(values: Array<string | undefined>): string[] {
    return [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ];
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
