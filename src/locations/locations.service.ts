import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableShape,
  TableStatus,
} from '../tables/schemas/table.schema';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location, LocationDocument } from './schemas/location.schema';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

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

    const previousFloors = this.normalizeFloors(
      existingLocation.tablePlanFloors,
    );
    const updatedLocation = await this.locationModel
      .findByIdAndUpdate(id, updateLocationDto, {
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

  private isPlatformAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles?.some((role) =>
      [Role.PlatformAdmin, Role.SuperAdmin].includes(role as Role),
    );
  }
}
