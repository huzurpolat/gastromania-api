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
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Area, AreaDocument } from './schemas/area.schema';

@Injectable()
export class AreasService {
  constructor(
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(dto: CreateAreaDto, actor: AuthenticatedUser) {
    const tenantId = this.resolveTenantId(actor);
    await this.assertNameAvailable(tenantId, dto.name);

    return this.areaModel.create({
      ...dto,
      tenantId,
      isActive: dto.isActive ?? true,
    });
  }

  async findAll(actor: AuthenticatedUser, includeRegions = false) {
    if (!actor.tenantId || !this.accessPolicy.isCompanyAdmin(actor)) {
      return [];
    }

    const areas = await this.areaModel
      .find({ tenantId: actor.tenantId })
      .sort({ name: 1 })
      .exec();

    if (!includeRegions || !areas.length) {
      return areas;
    }

    const areaIds = areas.map((area) => area._id.toString());
    const regions = await this.regionModel
      .find({
        tenantId: actor.tenantId,
        areaId: { $in: areaIds },
      })
      .select('_id tenantId areaId name description isActive createdAt updatedAt')
      .sort({ name: 1 })
      .lean()
      .exec();
    const regionsByArea = new Map<string, typeof regions>();

    for (const region of regions) {
      const key = region.areaId ?? '';
      regionsByArea.set(key, [...(regionsByArea.get(key) ?? []), region]);
    }

    return areas.map((area) => ({
      ...this.toPlainObject(area),
      regions: regionsByArea.get(area._id.toString()) ?? [],
    }));
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.areaModel.findById(id).exec();

    if (!area || !(await this.canViewArea(actor, area))) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return this.buildAreaDetail(area);
  }

  async update(id: string, dto: UpdateAreaDto, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.findAreaDocument(id, actor);

    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
    }

    if (dto.name && dto.name !== area.name) {
      await this.assertNameAvailable(area.tenantId, dto.name, area._id.toString());
    }

    const update: Partial<Area> = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    const updated = await this.areaModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return this.buildAreaDetail(updated);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.findAreaDocument(id, actor);

    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Bereich');
    }

    const dependencies = await this.getAreaDependencyLabels(area);

    if (dependencies.length) {
      throw new ConflictException(
        `Dieser Bereich kann nicht geloescht werden, weil noch ${this.formatDependencyList(
          dependencies,
        )} zugeordnet sind.`,
      );
    }

    const result = await this.areaModel
      .deleteOne({ _id: area._id, tenantId: area.tenantId })
      .exec();

    if (!result.deletedCount) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return { deleted: true, areaId: area._id.toString() };
  }

  async findUsers(areaId: string, actor: AuthenticatedUser) {
    const area = await this.findAreaDocument(areaId, actor);
    return this.findAreaUsers(area);
  }

  async assignUser(areaId: string, userId: string, actor: AuthenticatedUser) {
    const area = await this.findAreaDocument(areaId, actor);

    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Benutzerzuordnung');
    }

    this.validateObjectId(userId, 'Benutzer-ID');
    const user = await this.userModel
      .findOne({ _id: userId, tenantId: area.tenantId })
      .exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    const areaIds = [...new Set([...(user.areaIds ?? []), area._id.toString()])];
    await this.userModel
      .findByIdAndUpdate(user._id, { areaIds }, { returnDocument: 'after', runValidators: true })
      .exec();

    return this.findAreaUsers(area);
  }

  async unassignUser(areaId: string, userId: string, actor: AuthenticatedUser) {
    const area = await this.findAreaDocument(areaId, actor);

    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Benutzerzuordnung');
    }

    this.validateObjectId(userId, 'Benutzer-ID');
    const user = await this.userModel
      .findOne({ _id: userId, tenantId: area.tenantId })
      .exec();

    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden');
    }

    const areaIds = (user.areaIds ?? []).filter(
      (assignedAreaId) => assignedAreaId !== area._id.toString(),
    );
    await this.userModel
      .findByIdAndUpdate(user._id, { areaIds }, { returnDocument: 'after', runValidators: true })
      .exec();

    return this.findAreaUsers(area);
  }

  private resolveTenantId(actor: AuthenticatedUser): string {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext vorhanden');
    }

    return actor.tenantId;
  }

  private canAccessArea(actor: AuthenticatedUser, area: AreaDocument): boolean {
    if (actor.tenantId !== area.tenantId) {
      return false;
    }

    return this.accessPolicy.isCompanyAdmin(actor);
  }

  private async canViewArea(
    actor: AuthenticatedUser,
    area: AreaDocument,
  ): Promise<boolean> {
    if (this.canAccessArea(actor, area)) {
      return true;
    }

    if (actor.tenantId !== area.tenantId) {
      return false;
    }

    const areaId = area._id.toString();
    if (actor.areaIds?.includes(areaId)) {
      return true;
    }

    if (!actor.regionIds?.length) {
      return false;
    }

    const assignedRegion = await this.regionModel
      .exists({
        _id: { $in: actor.regionIds },
        tenantId: area.tenantId,
        areaId,
      })
      .exec();

    return Boolean(assignedRegion);
  }

  private async findAreaDocument(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AreaDocument> {
    this.validateObjectId(id, 'Bereichs-ID');
    const area = await this.areaModel.findById(id).exec();

    if (!area || !(await this.canViewArea(actor, area))) {
      throw new NotFoundException('Bereich nicht gefunden');
    }

    return area;
  }

  private async buildAreaDetail(area: AreaDocument) {
    const [regions, users, cityCount, locationCount] = await Promise.all([
      this.findAreaRegions(area),
      this.findAreaUsers(area),
      this.cityModel.countDocuments({
        tenantId: area.tenantId,
        areaId: area._id.toString(),
      }),
      this.locationModel.countDocuments({
        tenantId: area.tenantId,
        areaId: area._id.toString(),
      }),
    ]);

    return {
      ...this.toPlainObject(area),
      regions,
      users,
      stats: {
        regions: regions.length,
        cities: cityCount,
        locations: locationCount,
        users: users.length,
      },
    };
  }

  private findAreaRegions(area: AreaDocument) {
    return this.regionModel
      .find({
        tenantId: area.tenantId,
        areaId: area._id.toString(),
      })
      .select('_id tenantId areaId name description isActive createdAt updatedAt')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  private async findAreaUsers(area: AreaDocument) {
    const users = await this.userModel
      .find({
        tenantId: area.tenantId,
        areaIds: area._id.toString(),
      })
      .select('_id firstName lastName email roles status isActive areaIds createdAt updatedAt')
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean()
      .exec();

    return users.map((user) => ({
      _id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.roles?.[0] ?? 'Service',
      roles: user.roles ?? [],
      status: user.status ?? (user.isActive ? 'active' : 'disabled'),
      isActive: user.isActive,
    }));
  }

  private async getAreaDependencyLabels(area: AreaDocument): Promise<string[]> {
    const areaId = area._id.toString();
    const [regions, cities, locations, users] = await Promise.all([
      this.countDependency(
        'Regionen',
        this.regionModel.countDocuments({
          tenantId: area.tenantId,
          areaId,
        }),
      ),
      this.countDependency(
        'Staedte',
        this.cityModel.countDocuments({
          tenantId: area.tenantId,
          areaId,
        }),
      ),
      this.countDependency(
        'Standorte',
        this.locationModel.countDocuments({
          tenantId: area.tenantId,
          areaId,
        }),
      ),
      this.countDependency(
        'Benutzerzuweisungen',
        this.userModel.countDocuments({
          tenantId: area.tenantId,
          areaIds: areaId,
        }),
      ),
    ]);

    return [regions, cities, locations, users].filter(Boolean) as string[];
  }

  private async countDependency(
    label: string,
    countPromise: Promise<number> | { exec: () => Promise<number> },
  ): Promise<string | null> {
    const count =
      typeof (countPromise as { exec?: unknown }).exec === 'function'
        ? await (countPromise as { exec: () => Promise<number> }).exec()
        : await (countPromise as Promise<number>);

    return count > 0 ? label : null;
  }

  private formatDependencyList(dependencies: string[]): string {
    if (dependencies.length === 1) {
      return dependencies[0];
    }

    return `${dependencies.slice(0, -1).join(', ')} und ${dependencies.at(-1)}`;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private async assertNameAvailable(
    tenantId: string,
    name: string,
    currentAreaId?: string,
  ): Promise<void> {
    const existing = await this.areaModel
      .findOne({
        tenantId,
        name: { $regex: `^${this.escapeRegExp(name)}$`, $options: 'i' },
        ...(currentAreaId ? { _id: { $ne: currentAreaId } } : {}),
      })
      .select('_id')
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException('Bereichsname existiert in diesem Tenant bereits');
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toPlainObject(area: AreaDocument): Record<string, unknown> {
    return (
      typeof area.toObject === 'function' ? area.toObject() : area
    ) as unknown as Record<string, unknown>;
  }
}
