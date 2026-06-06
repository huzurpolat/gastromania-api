import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CitiesService } from './cities.service';

const actor = {
  _id: 'user-1',
  email: 'admin@frittenwerk-demo.demo',
  roles: ['TenantAdmin'],
  tenantId: 'tenant-frittenwerk',
  companyId: 'company-frittenwerk',
  areaIds: [],
  regionIds: [],
  locationIds: [],
  managedLocationIds: [],
  permissions: [],
};

const area = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  tenantId: 'tenant-frittenwerk',
  name: 'NRW',
};

const region = {
  _id: { toString: () => '507f1f77bcf86cd799439012' },
  tenantId: 'tenant-frittenwerk',
  areaId: '507f1f77bcf86cd799439011',
  name: 'Rheinland',
};

describe('CitiesService', () => {
  const createQuery = (value: unknown) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  const accessPolicy = {
    isCompanyAdmin: jest.fn((user) => user.roles.includes('TenantAdmin')),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates cities in the actor tenant and selected region', async () => {
    const cityModel = {
      findOne: jest.fn(() => createQuery(null)),
      create: jest.fn((payload) => Promise.resolve(payload)),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    const created = await service.create(
      {
        areaId: '507f1f77bcf86cd799439011',
        regionId: '507f1f77bcf86cd799439012',
        name: 'Koeln',
        description: 'Innenstadt und Umfeld',
      },
      actor,
    );

    expect(cityModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-frittenwerk',
        areaId: '507f1f77bcf86cd799439011',
        regionId: '507f1f77bcf86cd799439012',
        name: 'Koeln',
        isActive: true,
      }),
    );
    expect(created).toMatchObject({
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      regionId: '507f1f77bcf86cd799439012',
    });
  });

  it('rejects duplicate city names in the same tenant region', async () => {
    const cityModel = {
      findOne: jest.fn(() => createQuery({ _id: 'city-1' })),
      create: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(
      service.create(
        {
          areaId: '507f1f77bcf86cd799439011',
          regionId: '507f1f77bcf86cd799439012',
          name: 'Koeln',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cityModel.create).not.toHaveBeenCalled();
  });

  it('rejects regions that do not belong to the selected area with a bad request', async () => {
    const cityModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() =>
        createQuery({
          ...region,
          areaId: '507f1f77bcf86cd799439099',
        }),
      ),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(
      service.create(
        {
          areaId: '507f1f77bcf86cd799439011',
          regionId: '507f1f77bcf86cd799439012',
          name: 'Koeln',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cityModel.create).not.toHaveBeenCalled();
  });

  it('lists cities scoped to the tenant and optional region', async () => {
    const cityModel = {
      find: jest.fn((filter) => ({
        sort: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue([{ _id: 'city-1', ...filter }]),
        })),
      })),
    };
    const areaModel = {
      findOne: jest.fn(),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await service.findAll(actor, { regionId: '507f1f77bcf86cd799439012' });

    expect(cityModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
      regionId: '507f1f77bcf86cd799439012',
    });
  });

  it('blocks non tenant admins from city management', async () => {
    const serviceUser = {
      ...actor,
      roles: ['Service'],
    };
    accessPolicy.isCompanyAdmin.mockReturnValueOnce(false);
    const cityModel = {
      find: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(),
    };
    const regionModel = {
      findOne: jest.fn(),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(service.findAll(serviceUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(cityModel.find).not.toHaveBeenCalled();
  });

  it('physically deletes cities without assigned locations for tenant admins', async () => {
    const city = {
      _id: { toString: () => '507f1f77bcf86cd799439013' },
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      regionId: '507f1f77bcf86cd799439012',
      name: 'Koeln',
    };
    const cityModel = {
      findOne: jest.fn(() => createQuery(city)),
      deleteOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      })),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(0),
      })),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(
      service.remove('507f1f77bcf86cd799439013', actor),
    ).resolves.toEqual({
      deleted: true,
      cityId: '507f1f77bcf86cd799439013',
    });

    expect(locationModel.countDocuments).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
      cityId: '507f1f77bcf86cd799439013',
    });
    expect(cityModel.deleteOne).toHaveBeenCalledWith({
      _id: city._id,
      tenantId: 'tenant-frittenwerk',
    });
  });

  it('blocks deleting cities with assigned locations', async () => {
    const city = {
      _id: { toString: () => '507f1f77bcf86cd799439013' },
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      regionId: '507f1f77bcf86cd799439012',
      name: 'Koeln',
    };
    const cityModel = {
      findOne: jest.fn(() => createQuery(city)),
      deleteOne: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(1),
      })),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(
      service.remove('507f1f77bcf86cd799439013', actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(cityModel.deleteOne).not.toHaveBeenCalled();
  });

  it('blocks city deletion for non tenant admins', async () => {
    const city = {
      _id: { toString: () => '507f1f77bcf86cd799439013' },
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      regionId: '507f1f77bcf86cd799439012',
      name: 'Koeln',
    };
    const cityModel = {
      findOne: jest.fn(() => createQuery(city)),
      deleteOne: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
    };
    const locationModel = {
      countDocuments: jest.fn(),
    };
    const service = new CitiesService(
      cityModel as never,
      areaModel as never,
      regionModel as never,
      locationModel as never,
      accessPolicy as never,
    );

    await expect(
      service.remove('507f1f77bcf86cd799439013', {
        ...actor,
        roles: ['Regionalleiter'],
        regionIds: ['507f1f77bcf86cd799439012'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(locationModel.countDocuments).not.toHaveBeenCalled();
    expect(cityModel.deleteOne).not.toHaveBeenCalled();
  });
});
