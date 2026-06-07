import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import { City, CityDocument } from './schemas/city.schema';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

@Injectable()
export class CitiesService {
  constructor(
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateCityDto, actor: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(actor);
    const { area, region } = await this.findAreaAndRegionInTenant(
      dto.areaId,
      dto.regionId,
      tenantId,
    );
    this.assertCanManageCityScope(actor, area._id.toString(), region._id.toString());
    await this.assertNameAvailable(tenantId, region._id.toString(), dto.name);

    return this.cityModel.create({
      tenantId,
      areaId: area._id.toString(),
      regionId: region._id.toString(),
      name: dto.name,
      description: dto.description,
      notes: dto.notes,
      isActive: dto.isActive ?? true,
    });
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: { areaId?: string; regionId?: string } = {},
  ) {
    const tenantId = this.resolveTenantId(actor);
    const filter: Record<string, unknown> = { tenantId };

    if (filters.areaId) {
      const area = await this.findAreaInTenant(filters.areaId, tenantId);
      this.assertCanViewArea(actor, area._id.toString());
      filter.areaId = area._id.toString();
    }

    if (filters.regionId) {
      const region = await this.findRegionInTenant(
        filters.regionId,
        tenantId,
        filter.areaId as string | undefined,
      );
      this.assertCanViewRegion(actor, region);
      filter.regionId = region._id.toString();
    } else if (this.accessPolicy.isCompanyAdmin(actor)) {
      // Tenant admins can see all cities of the tenant.
    } else if (this.isBereichsleiter(actor) && actor.areaIds?.length) {
      filter.areaId = { $in: actor.areaIds };
    } else if (this.isRegionalleiter(actor) && actor.regionIds?.length) {
      filter.regionId = { $in: actor.regionIds };
    } else {
      throw new ForbiddenException('Keine Berechtigung fuer Staedte');
    }

    return this.cityModel.find(filter).sort({ name: 1 }).exec();
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Stadt-ID');
    const tenantId = this.resolveTenantId(actor);
    const city = await this.cityModel.findOne({ _id: id, tenantId }).exec();

    if (!city || !this.canViewCity(actor, city)) {
      throw new NotFoundException('Stadt nicht gefunden');
    }

    return city;
  }

  async update(id: string, dto: UpdateCityDto, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Stadt-ID');
    const city = await this.findOne(id, actor);
    const tenantId = city.tenantId;
    const nextAreaId = dto.areaId ?? city.areaId;
    const nextRegionId = dto.regionId ?? city.regionId;

    const { area, region } = await this.findAreaAndRegionInTenant(
      nextAreaId,
      nextRegionId,
      tenantId,
    );
    this.assertCanManageCityScope(actor, area._id.toString(), region._id.toString());

    const nextName = dto.name ?? city.name;
    if (
      nextName !== city.name ||
      region._id.toString() !== city.regionId
    ) {
      await this.assertNameAvailable(
        tenantId,
        region._id.toString(),
        nextName,
        city._id.toString(),
      );
    }

    return this.cityModel
      .findByIdAndUpdate(
        id,
        {
          ...(dto.areaId !== undefined ? { areaId: area._id.toString() } : {}),
          ...(dto.regionId !== undefined
            ? { regionId: region._id.toString() }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Stadt-ID');
    const city = await this.findOne(id, actor);
    this.assertCanDeleteCity(actor);

    const assignedLocations = await this.locationModel
      .countDocuments({
        tenantId: city.tenantId,
        cityId: city._id.toString(),
      })
      .exec();

    if (assignedLocations > 0) {
      throw new ConflictException(
        'Diese Stadt kann nicht gelöscht werden, weil noch Standorte zugeordnet sind.',
      );
    }

    const result = await this.cityModel
      .deleteOne({ _id: city._id, tenantId: city.tenantId })
      .exec();

    if (!result.deletedCount) {
      throw new NotFoundException('Stadt nicht gefunden');
    }

    return {
      deleted: true,
      cityId: city._id.toString(),
    };
  }

  private resolveTenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    return actor.tenantId;
  }

  private async findAreaAndRegionInTenant(
    areaId: string,
    regionId: string,
    tenantId: string,
  ): Promise<{ area: AreaDocument; region: RegionDocument }> {
    const [area, region] = await Promise.all([
      this.findAreaInTenant(areaId, tenantId),
      this.findRegionInTenant(regionId, tenantId),
    ]);

    if (region.areaId !== area._id.toString()) {
      throw new BadRequestException('Region does not belong to selected area.');
    }

    return { area, region };
  }

  private async findAreaInTenant(
    areaId: string,
    tenantId: string,
  ): Promise<AreaDocument> {
    this.validateObjectId(areaId, 'Bereichs-ID');
    const area = await this.areaModel.findOne({ _id: areaId, tenantId }).exec();

    if (!area) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return area;
  }

  private async findRegionInTenant(
    regionId: string,
    tenantId: string,
    areaId?: string,
  ): Promise<RegionDocument> {
    this.validateObjectId(regionId, 'Regions-ID');
    const region = await this.regionModel
      .findOne({
        _id: regionId,
        tenantId,
        ...(areaId ? { areaId } : {}),
      })
      .exec();

    if (!region) {
      throw new NotFoundException('Region nicht gefunden');
    }

    return region;
  }

  private assertCanViewArea(actor: AuthenticatedUser, areaId: string): void {
    if (
      this.accessPolicy.isCompanyAdmin(actor) ||
      actor.areaIds?.includes(areaId)
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
  }

  private assertCanViewRegion(
    actor: AuthenticatedUser,
    region: RegionDocument,
  ): void {
    if (this.canViewRegion(actor, region)) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diese Region');
  }

  private assertCanManageCityScope(
    actor: AuthenticatedUser,
    areaId: string,
    regionId: string,
  ): void {
    if (
      this.accessPolicy.isCompanyAdmin(actor) ||
      (this.isBereichsleiter(actor) && actor.areaIds?.includes(areaId)) ||
      (this.isRegionalleiter(actor) && actor.regionIds?.includes(regionId))
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diese Stadt');
  }

  private assertCanDeleteCity(actor: AuthenticatedUser): void {
    if (this.accessPolicy.isCompanyAdmin(actor)) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung zum Loeschen dieser Stadt');
  }

  private canViewCity(actor: AuthenticatedUser, city: CityDocument): boolean {
    return (
      this.accessPolicy.isCompanyAdmin(actor) ||
      actor.areaIds?.includes(city.areaId) ||
      actor.regionIds?.includes(city.regionId) ||
      false
    );
  }

  private canViewRegion(
    actor: AuthenticatedUser,
    region: RegionDocument,
  ): boolean {
    return (
      this.accessPolicy.isCompanyAdmin(actor) ||
      actor.areaIds?.includes(region.areaId ?? '') ||
      actor.regionIds?.includes(region._id.toString()) ||
      false
    );
  }

  private isBereichsleiter(actor: AuthenticatedUser): boolean {
    return (
      this.accessPolicy.isBereichsleiter?.(actor) ||
      this.hasRole(actor, Role.Bereichsleiter, Role.AreaManager)
    );
  }

  private isRegionalleiter(actor: AuthenticatedUser): boolean {
    return this.hasRole(actor, Role.Regionalleiter, Role.RegionalManager);
  }

  private hasRole(actor: AuthenticatedUser, ...roles: Role[]): boolean {
    return roles.some((role) => actor.roles?.includes(role));
  }

  private async assertNameAvailable(
    tenantId: string,
    regionId: string,
    name: string,
    currentCityId?: string,
  ): Promise<void> {
    const existing = await this.cityModel
      .findOne({
        tenantId,
        regionId,
        name: { $regex: `^${this.escapeRegExp(name)}$`, $options: 'i' },
        ...(currentCityId ? { _id: { $ne: currentCityId } } : {}),
      })
      .select('_id')
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException(
        'Stadtname existiert in dieser Region bereits',
      );
    }
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
