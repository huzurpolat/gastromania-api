import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Role } from '../auth/enums/role.enum';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export interface AssignableScope {
  companyId?: string;
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
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
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
    return this.hasAnyRole(user, [Role.CompanyAdmin, Role.Admin]);
  }

  isManagementRole(user?: AuthenticatedUser): boolean {
    return this.hasAnyRole(user, [
      Role.CompanyAdmin,
      Role.Admin,
      Role.Regionalleiter,
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
    const scopedFilter = this.locationScopeFilter(user, directIds);

    if (!Object.keys(scopedFilter).length) {
      return directIds;
    }

    const scopedIds = await this.findLocationIds(scopedFilter);

    return this.unique([...directIds, ...scopedIds]);
  }

  async getManageableLocationIds(user: AuthenticatedUser): Promise<string[]> {
    if (this.isPlatformAdmin(user) || this.isCompanyAdmin(user)) {
      return this.getReadableLocationIds(user);
    }

    const managedLocationIds = this.unique(user.managedLocationIds ?? []);

    if (managedLocationIds.length) {
      return managedLocationIds;
    }

    if (this.hasAnyRole(user, [Role.Filialleiter, Role.Restaurantleiter])) {
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

    return locationIds.length ? { _id: { $in: locationIds } } : { _id: { $in: [] } };
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

    const clauses: Record<string, unknown>[] = [];

    if (user.companyId) {
      clauses.push({ companyId: user.companyId });
    }

    if (user.regionIds?.length) {
      clauses.push({ regionIds: { $in: user.regionIds } });
    }

    const locationIds = await this.getReadableLocationIds(user);
    if (locationIds.length) {
      clauses.push(
        { locationId: { $in: locationIds } },
        { locationIds: { $in: locationIds } },
        { managedLocationIds: { $in: locationIds } },
      );
    }

    if (!clauses.length) {
      return { _id: { $in: [] } };
    }

    return { $or: clauses };
  }

  async canAccessCompany(
    user: AuthenticatedUser,
    companyId?: string,
  ): Promise<boolean> {
    if (!companyId || this.isPlatformAdmin(user)) {
      return true;
    }

    return user.companyId === companyId;
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

    if (!user.companyId) {
      return false;
    }

    const region = await this.regionModel.findById(regionId).select('companyId').exec();

    return region?.companyId === user.companyId;
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

  canAssignRole(user: AuthenticatedUser, role: string): boolean {
    if (this.isPlatformAdmin(user)) {
      return true;
    }

    if (this.platformRoles().includes(role)) {
      return false;
    }

    if (this.isCompanyAdmin(user)) {
      return true;
    }

    if (this.hasAnyRole(user, [Role.Regionalleiter])) {
      return [
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        ...this.operationalRoles(),
      ].includes(role as Role);
    }

    if (this.hasAnyRole(user, [Role.Filialleiter, Role.Restaurantleiter])) {
      return [Role.Schichtleiter, ...this.operationalRoles()].includes(
        role as Role,
      );
    }

    return false;
  }

  async canManageUser(
    actor: AuthenticatedUser,
    target: Pick<
      UserDocument,
      'roles' | 'companyId' | 'regionIds' | 'locationId' | 'locationIds' | 'managedLocationIds'
    >,
  ): Promise<boolean> {
    if (this.isPlatformAdmin(actor)) {
      return true;
    }

    if ((target.roles ?? []).some((role) => this.platformRoles().includes(role))) {
      return false;
    }

    const targetLocationIds = this.getScopeLocationIds(target);
    const readableLocationIds = await this.getReadableLocationIds(actor);
    const sharesLocation =
      targetLocationIds.length > 0 &&
      targetLocationIds.every((locationId) =>
        readableLocationIds.includes(locationId),
      );
    const sharesRegion =
      Boolean(actor.regionIds?.length) &&
      Boolean(target.regionIds?.length) &&
      (target.regionIds ?? []).every((regionId) =>
        actor.regionIds?.includes(regionId),
      );
    const sharesCompany =
      Boolean(actor.companyId) && target.companyId === actor.companyId;

    if (this.isCompanyAdmin(actor)) {
      return sharesRegion || sharesLocation || sharesCompany;
    }

    if (this.hasAnyRole(actor, [Role.Regionalleiter])) {
      return (
        sharesLocation &&
        !(target.roles ?? []).some((role) =>
          [
            Role.PlatformAdmin,
            Role.SuperAdmin,
            Role.CompanyAdmin,
            Role.Admin,
            Role.Regionalleiter,
          ].includes(role as Role),
        )
      );
    }

    if (this.hasAnyRole(actor, [Role.Filialleiter, Role.Restaurantleiter])) {
      return (
        sharesLocation &&
        (target.roles ?? []).every((role) =>
          [Role.Schichtleiter, ...this.operationalRoles()].includes(
            role as Role,
          ),
        )
      );
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
    if (payload.companyId && !(await this.canAccessCompany(actor, payload.companyId))) {
      throw new ForbiddenException('Keine Berechtigung fuer dieses Unternehmen');
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

  private locationScopeFilter(
    user: AuthenticatedUser,
    directIds: string[],
  ): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];

    if (directIds.length) {
      clauses.push({ _id: { $in: directIds } });
    }

    if (user.regionIds?.length) {
      clauses.push({ regionId: { $in: user.regionIds } });
    }

    if (user.companyId) {
      clauses.push({ companyId: user.companyId });
    }

    return clauses.length ? { $or: clauses } : {};
  }

  private async findLocationIds(
    filter: Record<string, unknown>,
  ): Promise<string[]> {
    const locations = await this.locationModel.find(filter).select('_id').exec();

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

  private hasAnyRole(user: AuthenticatedUser | undefined, roles: Role[]): boolean {
    return Boolean(user?.roles?.some((role) => roles.includes(role as Role)));
  }

  private platformRoles(): string[] {
    return [Role.PlatformAdmin, Role.SuperAdmin];
  }

  private operationalRoles(): Role[] {
    return [
      Role.Service,
      Role.Kueche,
      Role.Bar,
      Role.Theke,
      Role.Lager,
      Role.Einkauf,
      Role.Buchhaltung,
      Role.Marketing,
      Role.Personalabteilung,
      Role.Reinigung,
      Role.Eventmanager,
      Role.Kunde,
      Role.Tellerwaescher,
    ];
  }

  private unique(values: Array<string | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
