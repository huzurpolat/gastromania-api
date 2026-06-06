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
import { CounterPayment, CounterPaymentDocument } from '../counter/schemas/counter-payment.schema';
import { CounterSettings, CounterSettingsDocument } from '../counter/schemas/counter-settings.schema';
import { CounterOrderStatusLog, CounterOrderStatusLogDocument } from '../counter/schemas/counter-order-status-log.schema';
import { DailyClosing, DailyClosingDocument } from '../daily-closings/schemas/daily-closing.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import { InventoryBatch, InventoryBatchDocument } from '../stock/schemas/inventory-batch.schema';
import { InventoryLocation, InventoryLocationDocument } from '../stock/schemas/inventory-location.schema';
import { InventorySession, InventorySessionDocument } from '../stock/schemas/inventory-session.schema';
import { PurchaseOrder, PurchaseOrderDocument } from '../stock/schemas/purchase-order.schema';
import { StockAlert, StockAlertDocument } from '../stock/schemas/stock-alert.schema';
import { StockItem, StockItemDocument } from '../stock/schemas/stock-item.schema';
import { StockMovement, StockMovementDocument } from '../stock/schemas/stock-movement.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableShape,
  TableStatus,
} from '../tables/schemas/table.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
import { CreateLocationDto } from './dto/create-location.dto';
import {
  CreateTenantLocationDto,
  UpdateTenantLocationDto,
} from './dto/create-tenant-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location, LocationDocument } from './schemas/location.schema';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(InventoryLocation.name)
    private readonly inventoryLocationModel: Model<InventoryLocationDocument>,
    @InjectModel(InventoryBatch.name)
    private readonly inventoryBatchModel: Model<InventoryBatchDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(InventorySession.name)
    private readonly inventorySessionModel: Model<InventorySessionDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(StockAlert.name)
    private readonly stockAlertModel: Model<StockAlertDocument>,
    @InjectModel(DailyClosing.name)
    private readonly dailyClosingModel: Model<DailyClosingDocument>,
    @InjectModel(CounterPayment.name)
    private readonly counterPaymentModel: Model<CounterPaymentDocument>,
    @InjectModel(CounterSettings.name)
    private readonly counterSettingsModel: Model<CounterSettingsDocument>,
    @InjectModel(CounterOrderStatusLog.name)
    private readonly counterOrderStatusLogModel: Model<CounterOrderStatusLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly userLocationAssignmentModel: Model<UserLocationAssignmentDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async createTenantLocation(
    dto: CreateTenantLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    const tenantId = this.resolveTenantId(undefined, actor);
    this.assertTenantAdmin(actor);
    const { area, region, city } = await this.resolveTenantHierarchy(
      tenantId,
      dto.areaId,
      dto.regionId,
      dto.cityId,
    );
    const slug = this.toSlug(dto.name);
    await this.assertTenantLocationNameAvailable(tenantId, slug, dto.name);

    return this.locationModel.create(
      this.toTenantLocationPayload(dto, tenantId, area, region, city, slug),
    );
  }

  async findTenantLocations(
    actor: AuthenticatedUser,
    filters: { areaId?: string; regionId?: string; cityId?: string } = {},
  ): Promise<LocationDocument[]> {
    const tenantId = this.resolveTenantId(undefined, actor);
    this.assertTenantAdmin(actor);
    const filter: Record<string, unknown> = { tenantId };

    if (filters.areaId || filters.regionId || filters.cityId) {
      await this.resolveOptionalTenantHierarchy(tenantId, filters);
      if (filters.areaId) filter.areaId = filters.areaId;
      if (filters.regionId) filter.regionId = filters.regionId;
      if (filters.cityId) filter.cityId = filters.cityId;
    }

    return this.locationModel.find(filter).sort({ name: 1 }).exec();
  }

  async findTenantLocation(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);
    const tenantId = this.resolveTenantId(undefined, actor);
    this.assertTenantAdmin(actor);
    const location = await this.locationModel
      .findOne({ _id: id, tenantId })
      .exec();

    if (!location) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return location;
  }

  async updateTenantLocation(
    id: string,
    dto: UpdateTenantLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    const existing = await this.findTenantLocation(id, actor);
    const tenantId = this.resolveTenantId(undefined, actor);
    const areaId = dto.areaId ?? existing.areaId;
    const regionId = dto.regionId ?? existing.regionId;
    const cityId = dto.cityId ?? existing.cityId;

    if (!areaId || !regionId || !cityId) {
      throw new BadRequestException(
        'Selected area, region and city do not belong together.',
      );
    }

    const { area, region, city } = await this.resolveTenantHierarchy(
      tenantId,
      areaId,
      regionId,
      cityId,
    );
    const nextName = dto.name ?? existing.name;
    const nextSlug = dto.name ? this.toSlug(dto.name) : (existing.slug ?? this.toSlug(existing.name));
    if (dto.name && (nextName !== existing.name || nextSlug !== existing.slug)) {
      await this.assertTenantLocationNameAvailable(
        tenantId,
        nextSlug,
        nextName,
        existing._id.toString(),
      );
    }

    const payload = this.toTenantLocationPayload(
      {
        areaId,
        regionId,
        cityId,
        name: nextName,
        description: dto.description ?? existing.description,
        notes: dto.notes ?? existing.notes,
        addressLine1: dto.addressLine1 ?? existing.addressLine1 ?? existing.street,
        addressLine2: dto.addressLine2 ?? existing.addressLine2,
        postalCode: dto.postalCode ?? existing.postalCode ?? existing.zip,
        cityName: dto.cityName ?? existing.cityName ?? existing.city,
        country: dto.country ?? existing.country ?? 'Deutschland',
        phone: dto.phone ?? existing.phone,
        email: dto.email ?? existing.email,
        taxNumber: dto.taxNumber ?? existing.taxNumber,
        vatId: dto.vatId ?? existing.vatId,
        isActive: dto.isActive ?? existing.isActive,
      },
      tenantId,
      area,
      region,
      city,
      nextSlug,
    );

    const updated = await this.locationModel
      .findOneAndUpdate({ _id: id, tenantId }, payload, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return updated;
  }

  async deleteTenantLocation(id: string, actor: AuthenticatedUser) {
    const location = await this.findTenantLocation(id, actor);
    const dependencies = await this.getOperationalDependencyLabels(
      location._id.toString(),
      this.resolveTenantId(undefined, actor),
    );

    if (dependencies.length) {
      throw new ConflictException(
        `Dieser Standort kann nicht geloescht werden, weil noch ${this.formatDependencyList(
          dependencies,
        )} zugeordnet sind.`,
      );
    }

    const tenantId = this.resolveTenantId(undefined, actor);
    const result = await this.locationModel
      .deleteOne({ _id: location._id, tenantId })
      .exec();

    if (!result.deletedCount) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return { deleted: true, locationId: location._id.toString() };
  }

  async create(
    createLocationDto: CreateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    const tenantId = this.resolveTenantId(createLocationDto.tenantId, actor);
    const payload = {
      ...createLocationDto,
      tenantId,
      slug: createLocationDto.slug ?? this.toSlug(createLocationDto.name),
      postalCode: createLocationDto.postalCode ?? createLocationDto.zip,
      address:
        createLocationDto.address ??
        this.formatAddress(
          createLocationDto.street,
          createLocationDto.zip,
          createLocationDto.city,
        ),
      companyId: createLocationDto.companyId ?? actor.companyId,
      regionId:
        createLocationDto.regionId ??
        (actor.regionIds?.length === 1 ? actor.regionIds[0] : undefined),
    };

    await this.applyCityScope(payload);

    if (payload.companyId) {
      await this.accessPolicy.assertCompanyExists(payload.companyId);
    }

    if (payload.areaId) {
      await this.accessPolicy.assertAreaExists(payload.areaId);
    }

    if (payload.regionId) {
      await this.accessPolicy.assertRegionExists(payload.regionId);
    }

    await this.accessPolicy.assertAssignableScope(actor, {
      tenantId: payload.tenantId,
      areaIds: payload.areaId ? [payload.areaId] : [],
      companyId: payload.companyId,
      regionIds: payload.regionId ? [payload.regionId] : [],
      managedLocationIds: [],
      roles: [],
    });

    const location = await this.locationModel.create(payload);
    await this.createStartTablesForNewFloors(
      location,
      this.normalizeFloors(location.tablePlanFloors),
    );

    return location;
  }

  async findAll(actor: AuthenticatedUser): Promise<LocationDocument[]> {
    const filter = await this.accessPolicy.getReadableLocationFilter(actor);

    return this.locationModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);

    const location = await this.locationModel.findById(id).exec();

    if (!location || !(await this.accessPolicy.canAccessLocation(actor, id))) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return location;
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);
    await this.accessPolicy.assertCanManageLocation(actor, id);

    if (updateLocationDto.companyId) {
      await this.accessPolicy.assertCompanyExists(updateLocationDto.companyId);
    }
    if (updateLocationDto.areaId) {
      await this.accessPolicy.assertAreaExists(updateLocationDto.areaId);
      await this.accessPolicy.assertAssignableScope(actor, {
        areaIds: [updateLocationDto.areaId],
      });
    }
    if (
      updateLocationDto.tenantId !== undefined &&
      updateLocationDto.tenantId !== actor.tenantId &&
      !this.isPlatformAdmin(actor)
    ) {
      throw new ForbiddenException('Tenant eines Standorts darf nicht geaendert werden');
    }

    if (updateLocationDto.regionId) {
      await this.accessPolicy.assertRegionExists(updateLocationDto.regionId);
      await this.accessPolicy.assertAssignableScope(actor, {
        companyId: updateLocationDto.companyId,
        regionIds: [updateLocationDto.regionId],
      });
    }

    const existingLocation = await this.locationModel.findById(id).exec();

    if (!existingLocation) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    const payload = {
      ...updateLocationDto,
      tenantId: updateLocationDto.tenantId ?? existingLocation.tenantId,
      areaId: updateLocationDto.areaId ?? existingLocation.areaId,
      regionId: updateLocationDto.regionId ?? existingLocation.regionId,
      cityId: updateLocationDto.cityId ?? existingLocation.cityId,
      city: updateLocationDto.city ?? existingLocation.city,
    };
    await this.applyCityScope(payload);

    const previousFloors = this.normalizeFloors(
      existingLocation.tablePlanFloors,
    );
    const updatedLocation = await this.locationModel
      .findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updatedLocation) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    if (updateLocationDto.tablePlanFloors) {
      const nextFloors = this.normalizeFloors(updatedLocation.tablePlanFloors);
      const addedFloors = nextFloors.filter(
        (floor) =>
          !previousFloors.some(
            (previous) => previous.toLowerCase() === floor.toLowerCase(),
          ),
      );
      await this.createStartTablesForNewFloors(updatedLocation, addedFloors);
    }

    return updatedLocation;
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);
    await this.accessPolicy.assertCanManageLocation(actor, id);

    const deletedLocation = await this.locationModel
      .findByIdAndDelete(id)
      .exec();

    if (!deletedLocation) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return deletedLocation;
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Standort-ID');
    }
  }

  private async createStartTablesForNewFloors(
    location: LocationDocument,
    floors: string[],
  ): Promise<void> {
    for (const floor of floors) {
      const floorId = this.toFloorId(location._id.toString(), floor);
      const existingCount = await this.tableModel.countDocuments({
        locationId: location._id.toString(),
        floorId,
      });

      if (existingCount > 0) {
        continue;
      }

      for (const table of [
        { name: 'Tisch 1', x: 8, y: 8 },
        { name: 'Tisch 2', x: 26, y: 8 },
        { name: 'Tisch 3', x: 44, y: 8 },
      ]) {
        await this.tableModel.create({
          tenantId: location.tenantId,
          companyId: location.companyId,
          areaId: location.areaId,
          regionId: location.regionId,
          locationId: location._id.toString(),
          name: await this.createAvailableStartTableName(
            location._id.toString(),
            table.name,
          ),
          seats: 4,
          area: floor,
          icon: 'table_restaurant',
          status: TableStatus.Free,
          isActive: true,
          planX: table.x,
          planY: table.y,
          planWidth: 14,
          planHeight: 12,
          planRotation: 0,
          floorId,
          floorName: floor,
          planFloor: floor,
          planShape: TableShape.Rectangle,
        });
      }
    }
  }

  private async createAvailableStartTableName(
    locationId: string,
    baseName: string,
  ): Promise<string> {
    let candidate = baseName;
    let suffix = 2;

    while (await this.tableModel.exists({ locationId, name: candidate })) {
      candidate = `${baseName} (${suffix})`;
      suffix += 1;
    }

    return candidate;
  }

  private normalizeFloors(floors: string[] | undefined): string[] {
    const normalized = new Set(
      ['EG', ...(floors ?? [])].map((floor) => floor.trim()).filter(Boolean),
    );

    return Array.from(normalized);
  }

  private toFloorId(locationId: string, floorName: string): string {
    const slug = floorName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${locationId}:${slug || 'floor'}`;
  }

  private toSlug(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private formatAddress(street: string, zip: string, city: string): string {
    return [street, [zip, city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
  }

  private resolveTenantId(
    requestedTenantId: string | undefined,
    actor: AuthenticatedUser,
  ): string {
    if (this.isPlatformAdmin(actor)) {
      if (!requestedTenantId) {
        throw new BadRequestException(
          'Tenant-ID ist fuer Plattform-Standorte erforderlich',
        );
      }

      return requestedTenantId;
    }

    if (!actor.tenantId) {
      throw new BadRequestException(
        'Benutzer ohne Tenant-ID duerfen keine Standorte verwalten',
      );
    }

    if (requestedTenantId && requestedTenantId !== actor.tenantId) {
      throw new ForbiddenException('Standort muss im eigenen Tenant liegen');
    }

    return actor.tenantId;
  }

  private async applyCityScope(payload: {
    tenantId?: string;
    areaId?: string;
    regionId?: string;
    cityId?: string;
    city?: string;
  }): Promise<void> {
    if (!payload.cityId) {
      return;
    }

    if (!payload.tenantId) {
      throw new BadRequestException('Tenant-ID ist fuer Stadtzuordnung erforderlich');
    }

    this.validateObjectId(payload.cityId);
    const city = await this.cityModel
      .findOne({ _id: payload.cityId, tenantId: payload.tenantId })
      .exec();

    if (!city) {
      throw new BadRequestException('Stadt existiert nicht in diesem Tenant');
    }

    if (payload.areaId && payload.areaId !== city.areaId) {
      throw new BadRequestException('Stadt gehoert nicht zu diesem Bereich');
    }

    if (payload.regionId && payload.regionId !== city.regionId) {
      throw new BadRequestException('Stadt gehoert nicht zu dieser Region');
    }

    payload.areaId = city.areaId;
    payload.regionId = city.regionId;
    payload.city = payload.city || city.name;
  }

  private assertTenantAdmin(actor: AuthenticatedUser): void {
    if (this.accessPolicy.isCompanyAdmin(actor)) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer Tenant-Standorte');
  }

  private async resolveTenantHierarchy(
    tenantId: string,
    areaId: string,
    regionId: string,
    cityId: string,
  ): Promise<{
    area: AreaDocument;
    region: RegionDocument;
    city: CityDocument;
  }> {
    this.validateObjectId(areaId);
    this.validateObjectId(regionId);
    this.validateObjectId(cityId);

    const [area, region, city] = await Promise.all([
      this.areaModel.findOne({ _id: areaId, tenantId }).exec(),
      this.regionModel.findOne({ _id: regionId, tenantId }).exec(),
      this.cityModel.findOne({ _id: cityId, tenantId }).exec(),
    ]);

    if (
      !area ||
      !region ||
      !city ||
      region.areaId !== area._id.toString() ||
      city.regionId !== region._id.toString() ||
      city.areaId !== area._id.toString()
    ) {
      throw new BadRequestException(
        'Selected area, region and city do not belong together.',
      );
    }

    return { area, region, city };
  }

  private async resolveOptionalTenantHierarchy(
    tenantId: string,
    filters: { areaId?: string; regionId?: string; cityId?: string },
  ): Promise<void> {
    if (filters.cityId) {
      const city = await this.cityModel
        .findOne({ _id: filters.cityId, tenantId })
        .exec();
      if (!city) {
        throw new BadRequestException(
          'Selected area, region and city do not belong together.',
        );
      }

      filters.regionId = filters.regionId ?? city.regionId;
      filters.areaId = filters.areaId ?? city.areaId;
    }

    if (filters.regionId) {
      const region = await this.regionModel
        .findOne({ _id: filters.regionId, tenantId })
        .exec();
      if (!region) {
        throw new BadRequestException(
          'Selected area, region and city do not belong together.',
        );
      }

      filters.areaId = filters.areaId ?? region.areaId;
    }

    if (filters.areaId) {
      const area = await this.areaModel
        .findOne({ _id: filters.areaId, tenantId })
        .exec();
      if (!area) {
        throw new BadRequestException(
          'Selected area, region and city do not belong together.',
        );
      }
    }

    if (filters.areaId && filters.regionId) {
      const region = await this.regionModel
        .findOne({ _id: filters.regionId, tenantId, areaId: filters.areaId })
        .exec();
      if (!region) {
        throw new BadRequestException(
          'Selected area, region and city do not belong together.',
        );
      }
    }

    if (filters.regionId && filters.cityId) {
      const city = await this.cityModel
        .findOne({
          _id: filters.cityId,
          tenantId,
          regionId: filters.regionId,
          ...(filters.areaId ? { areaId: filters.areaId } : {}),
        })
        .exec();
      if (!city) {
        throw new BadRequestException(
          'Selected area, region and city do not belong together.',
        );
      }
    }
  }

  private toTenantLocationPayload(
    dto: CreateTenantLocationDto,
    tenantId: string,
    area: AreaDocument,
    region: RegionDocument,
    city: CityDocument,
    slug: string,
  ): Partial<Location> {
    const cityName = dto.cityName || city.name;

    return {
      tenantId,
      areaId: area._id.toString(),
      regionId: region._id.toString(),
      cityId: city._id.toString(),
      companyId: undefined,
      name: dto.name,
      slug,
      description: dto.description,
      notes: dto.notes,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      postalCode: dto.postalCode,
      cityName,
      country: dto.country,
      phone: dto.phone,
      email: dto.email,
      taxNumber: dto.taxNumber,
      vatId: dto.vatId,
      isActive: dto.isActive ?? true,
      street: dto.addressLine1,
      zip: dto.postalCode,
      city: cityName,
      address: this.formatAddress(dto.addressLine1, dto.postalCode, cityName),
    };
  }

  private async assertTenantLocationNameAvailable(
    tenantId: string,
    slug: string,
    name: string,
    currentLocationId?: string,
  ): Promise<void> {
    const existing = await this.locationModel
      .findOne({
        tenantId,
        $or: [
          { slug },
          { name: { $regex: `^${this.escapeRegExp(name)}$`, $options: 'i' } },
        ],
        ...(currentLocationId ? { _id: { $ne: currentLocationId } } : {}),
      })
      .select('_id')
      .lean()
      .exec();

    if (existing) {
      throw new ConflictException(
        'Standortname oder Slug existiert in diesem Tenant bereits',
      );
    }
  }

  private async getOperationalDependencyLabels(
    locationId: string,
    tenantId: string,
  ): Promise<string[]> {
    const results = await Promise.all([
      this.countDependency('Bestellungen', this.orderModel.countDocuments({ locationId, tenantId }).exec()),
      this.countDependency('Tische', this.tableModel.countDocuments({ locationId, tenantId }).exec()),
      this.countDependency('Lagerartikel', this.stockItemModel.countDocuments({ locationId, tenantId }).exec()),
      this.countDependency(
        'Lagerorte',
        this.inventoryLocationModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency('Lagerchargen', this.inventoryBatchModel.countDocuments({ locationId, tenantId }).exec()),
      this.countDependency(
        'Lagerbewegungen',
        this.stockMovementModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency(
        'Inventuren',
        this.inventorySessionModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency(
        'Lieferantenbestellungen',
        this.purchaseOrderModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency('Lagerwarnungen', this.stockAlertModel.countDocuments({ locationId, tenantId }).exec()),
      this.countDependency(
        'Tagesabschluesse',
        this.dailyClosingModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency(
        'Thekenzahlungen',
        this.counterPaymentModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency('Thekeneinstellungen', this.counterSettingsModel.countDocuments({ locationId }).exec()),
      this.countDependency(
        'Thekenstatus-Historie',
        this.counterOrderStatusLogModel.countDocuments({ locationId, tenantId }).exec(),
      ),
      this.countDependency(
        'Benutzer',
        this.userModel
          .countDocuments({
            tenantId,
            $or: [
              { locationId },
              { locationIds: locationId },
              { managedLocationIds: locationId },
            ],
          })
          .exec(),
      ),
      this.countDependency(
        'Benutzerzuweisungen',
        this.userLocationAssignmentModel
          .countDocuments({ tenantId, locationId })
          .exec(),
      ),
    ]);

    return results
      .filter((result) => result.count > 0)
      .map((result) => `${result.label} (${result.count})`);
  }

  private async countDependency(
    label: string,
    countPromise: Promise<number>,
  ): Promise<{ label: string; count: number }> {
    return { label, count: await countPromise };
  }

  private formatDependencyList(dependencies: string[]): string {
    if (dependencies.length <= 3) {
      return dependencies.join(', ');
    }

    return `${dependencies.slice(0, 3).join(', ')} und ${dependencies.length - 3} weitere`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isPlatformAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles?.some((role) =>
      [Role.PlatformAdmin, Role.SuperAdmin].includes(role as Role),
    );
  }
}
