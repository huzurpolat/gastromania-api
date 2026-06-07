import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessPolicyService } from '../access/access-policy.service';
import { Area } from '../areas/schemas/area.schema';
import { City } from '../cities/schemas/city.schema';
import { CounterPayment } from '../counter/schemas/counter-payment.schema';
import { CounterOrderStatusLog } from '../counter/schemas/counter-order-status-log.schema';
import { CounterSettings } from '../counter/schemas/counter-settings.schema';
import { DailyClosing } from '../daily-closings/schemas/daily-closing.schema';
import { Order } from '../orders/schemas/order.schema';
import { Region } from '../regions/schemas/region.schema';
import { InventoryBatch } from '../stock/schemas/inventory-batch.schema';
import { InventoryLocation } from '../stock/schemas/inventory-location.schema';
import { InventorySession } from '../stock/schemas/inventory-session.schema';
import { PurchaseOrder } from '../stock/schemas/purchase-order.schema';
import { StockAlert } from '../stock/schemas/stock-alert.schema';
import { StockItem } from '../stock/schemas/stock-item.schema';
import { StockMovement } from '../stock/schemas/stock-movement.schema';
import { RestaurantTable } from '../tables/schemas/table.schema';
import { UserLocationAssignment } from '../users/schemas/user-location-assignment.schema';
import { User } from '../users/schemas/user.schema';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';
import { Location, LocationDocument } from './schemas/location.schema';

describe('LocationsService', () => {
  let service: LocationsService;

  const location = {
    _id: '6627d9a2c6f2d8f3e2b1a001',
    name: 'Gastromania Mitte',
    street: 'Hauptstrasse 1',
    zip: '10115',
    city: 'Berlin',
    federalState: 'Berlin',
    isActive: true,
  } as unknown as LocationDocument;

  const locationModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
  const areaModel = { findOne: jest.fn() };
  const cityModel = { findOne: jest.fn() };
  const regionModel = { findOne: jest.fn() };
  const tableModel = {
    countDocuments: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const dependencyModel = () => ({
    countDocuments: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue(0),
    })),
    deleteMany: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    })),
    updateMany: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    })),
  });
  const dependencyModels = new Map<Function, ReturnType<typeof dependencyModel>>();
  const actor = {
    sub: 'user-admin',
    email: 'admin@nrw.local',
    roles: ['Admin'],
    tenantId: 'tenant-nrw',
    regionIds: ['region-nrw'],
    locationIds: ['6627d9a2c6f2d8f3e2b1a001'],
  };
  const accessPolicy = {
    assertCompanyExists: jest.fn(),
    assertRegionExists: jest.fn(),
    assertAssignableScope: jest.fn(),
    getReadableLocationFilter: jest.fn(),
    canAccessLocation: jest.fn(),
    assertCanManageLocation: jest.fn(),
    isCompanyAdmin: jest.fn(),
    isScopedLocationManager: jest.fn(),
    getManageableLocationIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: getModelToken(Location.name),
          useValue: locationModel,
        },
        {
          provide: getModelToken(Area.name),
          useValue: areaModel,
        },
        {
          provide: getModelToken(City.name),
          useValue: cityModel,
        },
        {
          provide: getModelToken(Region.name),
          useValue: regionModel,
        },
        {
          provide: getModelToken(RestaurantTable.name),
          useValue: tableModel,
        },
        ...[
          Order,
          StockItem,
          InventoryLocation,
          InventoryBatch,
          StockMovement,
          InventorySession,
          PurchaseOrder,
          StockAlert,
          DailyClosing,
          CounterPayment,
          CounterSettings,
          CounterOrderStatusLog,
          User,
          UserLocationAssignment,
        ].map((model) => {
          const mock = dependencyModel();
          dependencyModels.set(model, mock);
          return {
            provide: getModelToken(model.name),
            useValue: mock,
          };
        }),
        {
          provide: AccessPolicyService,
          useValue: accessPolicy,
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    jest.clearAllMocks();
    accessPolicy.getReadableLocationFilter.mockResolvedValue({});
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    accessPolicy.isCompanyAdmin.mockReturnValue(true);
    accessPolicy.isScopedLocationManager.mockReturnValue(false);
    accessPolicy.getManageableLocationIds.mockResolvedValue([]);
    tableModel.countDocuments.mockResolvedValue(1);
    tableModel.exists.mockResolvedValue(null);
    tableModel.deleteMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    });
  });

  it('creates a location', async () => {
    const dto: CreateLocationDto = {
      name: 'Gastromania Mitte',
      street: 'Hauptstrasse 1',
      zip: '10115',
      city: 'Berlin',
      federalState: 'Berlin',
    };

    locationModel.create.mockResolvedValue(location);

    await expect(service.create(dto, actor)).resolves.toBe(location);
    expect(locationModel.create).toHaveBeenCalledWith({
      ...dto,
      tenantId: 'tenant-nrw',
      slug: 'gastromania-mitte',
      address: 'Hauptstrasse 1, 10115 Berlin',
      companyId: undefined,
      regionId: 'region-nrw',
      postalCode: '10115',
    });
  });

  it('creates tenant locations with validated hierarchy without start tables', async () => {
    const area = { _id: { toString: () => '507f1f77bcf86cd799439011' } };
    const region = {
      _id: { toString: () => '507f1f77bcf86cd799439012' },
      areaId: '507f1f77bcf86cd799439011',
    };
    const city = {
      _id: { toString: () => '507f1f77bcf86cd799439013' },
      areaId: '507f1f77bcf86cd799439011',
      regionId: '507f1f77bcf86cd799439012',
      name: 'Koeln',
    };
    areaModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(area),
    });
    regionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(region),
    });
    cityModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(city),
    });
    locationModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(null),
    });
    locationModel.create.mockResolvedValue(location);

    await expect(
      service.createTenantLocation(
        {
          areaId: '507f1f77bcf86cd799439011',
          regionId: '507f1f77bcf86cd799439012',
          cityId: '507f1f77bcf86cd799439013',
          name: 'Koeln Innenstadt',
          addressLine1: 'Hohe Strasse 1',
          postalCode: '50667',
          cityName: 'Koeln',
          country: 'Deutschland',
        },
        { ...actor, roles: ['TenantAdmin'] },
      ),
    ).resolves.toBe(location);

    expect(locationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-nrw',
        areaId: '507f1f77bcf86cd799439011',
        regionId: '507f1f77bcf86cd799439012',
        cityId: '507f1f77bcf86cd799439013',
        name: 'Koeln Innenstadt',
        slug: 'koeln-innenstadt',
        street: 'Hohe Strasse 1',
        zip: '50667',
        city: 'Koeln',
      }),
    );
    expect(tableModel.create).not.toHaveBeenCalled();
  });

  it('rejects tenant locations with mismatched hierarchy', async () => {
    areaModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
      }),
    });
    regionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439012' },
        areaId: '507f1f77bcf86cd799439099',
      }),
    });
    cityModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439013' },
        areaId: '507f1f77bcf86cd799439011',
        regionId: '507f1f77bcf86cd799439012',
      }),
    });

    await expect(
      service.createTenantLocation(
        {
          areaId: '507f1f77bcf86cd799439011',
          regionId: '507f1f77bcf86cd799439012',
          cityId: '507f1f77bcf86cd799439013',
          name: 'Koeln Innenstadt',
          addressLine1: 'Hohe Strasse 1',
          postalCode: '50667',
          cityName: 'Koeln',
          country: 'Deutschland',
        },
        { ...actor, roles: ['TenantAdmin'] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(locationModel.create).not.toHaveBeenCalled();
  });

  it('returns all locations sorted by newest first', async () => {
    const exec = jest.fn().mockResolvedValue([location]);
    const sort = jest.fn().mockReturnValue({ exec });

    locationModel.find.mockReturnValue({ sort });

    await expect(service.findAll(actor)).resolves.toEqual([location]);
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('returns only own tenant locations for scoped location managers', async () => {
    const exec = jest.fn().mockResolvedValue([location]);
    const sort = jest.fn().mockReturnValue({ exec });
    locationModel.find.mockReturnValue({ sort });
    accessPolicy.isCompanyAdmin.mockReturnValue(false);
    accessPolicy.isScopedLocationManager.mockReturnValue(true);
    accessPolicy.getManageableLocationIds.mockResolvedValue([
      '6627d9a2c6f2d8f3e2b1a001',
    ]);

    await expect(
      service.findTenantLocations({
        ...actor,
        roles: ['Filialleiter'],
        locationAssignments: [
          {
            locationId: '6627d9a2c6f2d8f3e2b1a001',
            role: 'LOCATION_MANAGER',
          },
        ],
      } as never),
    ).resolves.toEqual([location]);

    expect(locationModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-nrw',
      _id: { $in: ['6627d9a2c6f2d8f3e2b1a001'] },
    });
  });

  it('returns one location by id', async () => {
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(
      service.findOne('6627d9a2c6f2d8f3e2b1a001', actor),
    ).resolves.toBe(location);
  });

  it('throws BadRequestException for an invalid id', async () => {
    await expect(service.findOne('invalid-id', actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when a location does not exist', async () => {
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.findOne('6627d9a2c6f2d8f3e2b1a001', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a location', async () => {
    const dto: UpdateLocationDto = {
      city: 'Hamburg',
      federalState: 'Hamburg',
    };

    locationModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(
      service.update('6627d9a2c6f2d8f3e2b1a001', dto, actor),
    ).resolves.toBe(location);
    expect(locationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      '6627d9a2c6f2d8f3e2b1a001',
      dto,
      {
        returnDocument: 'after',
        runValidators: true,
      },
    );
  });

  it('removes a location', async () => {
    locationModel.findByIdAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(
      service.remove('6627d9a2c6f2d8f3e2b1a001', actor),
    ).resolves.toBe(location);
  });

  it('physically deletes tenant locations without operative dependencies', async () => {
    locationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...location,
        tenantId: 'tenant-nrw',
        _id: { toString: () => '6627d9a2c6f2d8f3e2b1a001' },
      }),
    });
    tableModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    locationModel.deleteOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    await expect(
      service.deleteTenantLocation('6627d9a2c6f2d8f3e2b1a001', {
        ...actor,
        roles: ['TenantAdmin'],
      }),
    ).resolves.toEqual({
      deleted: true,
      locationId: '6627d9a2c6f2d8f3e2b1a001',
    });
  });

  it('blocks tenant location deletion when operative dependencies exist', async () => {
    locationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...location,
        tenantId: 'tenant-nrw',
        _id: { toString: () => '6627d9a2c6f2d8f3e2b1a001' },
      }),
    });
    tableModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.deleteTenantLocation('6627d9a2c6f2d8f3e2b1a001', {
        ...actor,
        roles: ['TenantAdmin'],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(locationModel.deleteOne).not.toHaveBeenCalled();
  });

  it('force deletes tenant locations and clears location scoped dependencies', async () => {
    const targetLocationId = '6627d9a2c6f2d8f3e2b1a001';
    locationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...location,
        tenantId: 'tenant-nrw',
        _id: { toString: () => targetLocationId },
      }),
    });
    tableModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });
    locationModel.deleteOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    await expect(
      service.deleteTenantLocation(
        targetLocationId,
        {
          ...actor,
          roles: ['TenantAdmin'],
        },
        { force: true },
      ),
    ).resolves.toEqual({
      deleted: true,
      locationId: targetLocationId,
    });

    expect(tableModel.deleteMany).toHaveBeenCalledWith({
      locationId: targetLocationId,
      tenantId: 'tenant-nrw',
    });
    expect(dependencyModels.get(User)?.updateMany).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-nrw',
        $or: [
          { locationId: targetLocationId },
          { locationIds: targetLocationId },
          { managedLocationIds: targetLocationId },
        ],
      },
      {
        $unset: { locationId: '' },
        $pull: {
          locationIds: targetLocationId,
          managedLocationIds: targetLocationId,
        },
      },
    );
    expect(locationModel.deleteOne).toHaveBeenCalledWith({
      _id: expect.anything(),
      tenantId: 'tenant-nrw',
    });
  });

  it('returns NotFoundException for locations outside the actor scope', async () => {
    accessPolicy.canAccessLocation.mockResolvedValue(false);
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(
      service.findOne('6627d9a2c6f2d8f3e2b1a001', actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
