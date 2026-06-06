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
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { Region, RegionDocument } from './schemas/region.schema';

@Injectable()
export class RegionsService {
  constructor(
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateRegionDto, actor: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(actor);
    const area = await this.findAreaInTenant(dto.areaId, tenantId);
    this.assertCanManageArea(actor, area._id.toString());
    await this.assertNameAvailable(tenantId, area._id.toString(), dto.name);

    return this.regionModel.create({
      tenantId,
      companyId: actor.companyId,
      areaId: area._id.toString(),
      name: dto.name,
      description: dto.description,
      notes: dto.notes,
      code: this.buildCode(area._id.toString(), dto.name),
      isActive: dto.isActive ?? true,
    });
  }

  async findAll(actor: AuthenticatedUser, areaId?: string) {
    const tenantId = this.resolveTenantId(actor);
    const filter: Record<string, unknown> = { tenantId };

    if (areaId) {
      const area = await this.findAreaInTenant(areaId, tenantId);
      this.assertCanViewArea(actor, area._id.toString());
      filter.areaId = area._id.toString();
    } else if (this.accessPolicy.isCompanyAdmin(actor)) {
      // Tenant admins can see the whole tenant.
    } else if (this.isBereichsleiter(actor) && actor.areaIds?.length) {
      filter.areaId = { $in: actor.areaIds };
    } else if (this.isRegionalleiter(actor) && actor.regionIds?.length) {
      filter._id = { $in: actor.regionIds };
    } else {
      throw new ForbiddenException('Keine Berechtigung fuer Regionen');
    }

    return this.regionModel.find(filter).sort({ name: 1 }).exec();
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const region = await this.findRegionDocument(id, actor);
    return this.buildRegionDetail(region);
  }

  async update(id: string, dto: UpdateRegionDto, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Regions-ID');
    const region = await this.findRegionDocument(id, actor);
    this.assertCanManageRegion(actor, region);
    const areaId = dto.areaId
      ? (await this.findAreaInTenant(dto.areaId, region.tenantId))._id.toString()
      : region.areaId;

    if (!areaId) {
      throw new BadRequestException('Bereich ist erforderlich');
    }

    if (dto.areaId !== undefined) {
      this.assertCanManageArea(actor, areaId);
    }

    if (
      dto.name &&
      (dto.name !== region.name || areaId !== region.areaId)
    ) {
      await this.assertNameAvailable(
        region.tenantId,
        areaId,
        dto.name,
        region._id.toString(),
      );
    } else if (areaId !== region.areaId) {
      await this.assertNameAvailable(
        region.tenantId,
        areaId,
        region.name,
        region._id.toString(),
      );
    }

    const update: Partial<Region> = {
      ...(dto.areaId !== undefined ? { areaId } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    if (dto.name !== undefined || dto.areaId !== undefined) {
      update.code = this.buildCode(areaId, dto.name ?? region.name);
    }

    const updated = await this.regionModel
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Region nicht gefunden');
    }

    return this.buildRegionDetail(updated);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Regions-ID');
    const region = await this.findRegionDocument(id, actor);
    this.assertCanManageRegion(actor, region);

    return this.regionModel
      .findByIdAndUpdate(
        region._id,
        { isActive: false },
        { new: true, runValidators: true },
      )
      .exec();
  }

  private resolveTenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    return actor.tenantId;
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

  private async findRegionDocument(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RegionDocument> {
    this.validateObjectId(id, 'Regions-ID');
    const tenantId = this.resolveTenantId(actor);
    const region = await this.regionModel
      .findOne({ _id: id, tenantId })
      .exec();

    if (!region) {
      throw new NotFoundException('Region nicht gefunden');
    }

    if (!this.canViewRegion(actor, region)) {
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

  private assertCanManageArea(actor: AuthenticatedUser, areaId: string): void {
    if (
      this.accessPolicy.isCompanyAdmin(actor) ||
      (this.isBereichsleiter(actor) && actor.areaIds?.includes(areaId))
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
  }

  private assertCanManageRegion(
    actor: AuthenticatedUser,
    region: RegionDocument,
  ): void {
    if (
      this.accessPolicy.isCompanyAdmin(actor) ||
      (this.isBereichsleiter(actor) &&
        actor.areaIds?.includes(region.areaId ?? '')) ||
      (this.isRegionalleiter(actor) &&
        actor.regionIds?.includes(region._id.toString()))
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diese Region');
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

  private async buildRegionDetail(region: RegionDocument) {
    const [area, cities, locations, users] = await Promise.all([
      this.areaModel
        .findOne({ _id: region.areaId, tenantId: region.tenantId })
        .select('_id tenantId name description notes isActive createdAt updatedAt')
        .lean()
        .exec(),
      this.cityModel
        .find({ tenantId: region.tenantId, regionId: region._id.toString() })
        .select('_id tenantId areaId regionId name description notes isActive createdAt updatedAt')
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.locationModel
        .find({ tenantId: region.tenantId, regionId: region._id.toString() })
        .select('_id tenantId areaId regionId cityId name city address postalCode isActive createdAt updatedAt')
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.userModel
        .find({ tenantId: region.tenantId, regionIds: region._id.toString() })
        .select('_id firstName lastName email roles status isActive regionIds createdAt updatedAt')
        .sort({ lastName: 1, firstName: 1, email: 1 })
        .lean()
        .exec(),
    ]);

    return {
      ...this.toPlainObject(region),
      area,
      cities,
      locations,
      users: users.map((user) => ({
        _id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.roles?.[0] ?? 'Service',
        roles: user.roles ?? [],
        status: user.status ?? (user.isActive ? 'active' : 'disabled'),
        isActive: user.isActive,
      })),
      stats: {
        cities: cities.length,
        locations: locations.length,
        users: users.length,
      },
    };
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private async assertNameAvailable(
    tenantId: string,
    areaId: string,
    name: string,
    currentRegionId?: string,
  ): Promise<void> {
    const existing = await this.regionModel
      .findOne({
        tenantId,
        areaId,
        name: { $regex: `^${this.escapeRegExp(name)}$`, $options: 'i' },
        ...(currentRegionId ? { _id: { $ne: currentRegionId } } : {}),
      })
      .select('_id')
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException(
        'Regionsname existiert in diesem Bereich bereits',
      );
    }
  }

  private buildCode(areaId: string, name: string): string {
    const slug = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return `${areaId.slice(-8).toUpperCase()}_${slug || 'REGION'}`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toPlainObject(region: RegionDocument): Record<string, unknown> {
    return (
      typeof region.toObject === 'function' ? region.toObject() : region
    ) as unknown as Record<string, unknown>;
  }
}
