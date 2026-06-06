import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegionsService } from './regions.service';

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

const emptyModel = {
  find: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
  findOne: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null),
  })),
  countDocuments: jest.fn(() => ({
    exec: jest.fn().mockResolvedValue(0),
  })),
};

describe('RegionsService', () => {
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

  it('creates regions in the actor tenant and selected tenant area', async () => {
    const regionModel = {
      findOne: jest.fn(() => createQuery(null)),
      create: jest.fn((payload) => Promise.resolve(payload)),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    const created = await service.create(
      {
        areaId: '507f1f77bcf86cd799439011',
        name: 'Rheinland',
        description: 'Koeln/Bonn',
      },
      actor,
    );

    expect(areaModel.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      tenantId: 'tenant-frittenwerk',
    });
    expect(regionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-frittenwerk',
        companyId: 'company-frittenwerk',
        areaId: '507f1f77bcf86cd799439011',
        name: 'Rheinland',
        description: 'Koeln/Bonn',
        isActive: true,
      }),
    );
    expect(created).toMatchObject({
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
    });
  });

  it('rejects duplicate region names in the same tenant area', async () => {
    const regionModel = {
      findOne: jest.fn(() => createQuery({ _id: 'region-1' })),
      create: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await expect(
      service.create(
        { areaId: '507f1f77bcf86cd799439011', name: 'Rheinland' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regionModel.create).not.toHaveBeenCalled();
  });

  it('rejects areas from another tenant', async () => {
    const regionModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(null)),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await expect(
      service.create(
        { areaId: '507f1f77bcf86cd799439011', name: 'Rheinland' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(regionModel.create).not.toHaveBeenCalled();
  });

  it('lists regions only for the tenant admin tenant', async () => {
    const regionModel = {
      find: jest.fn((filter) => ({
        sort: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue([{ _id: 'region-1', ...filter }]),
        })),
      })),
    };
    const areaModel = {
      findOne: jest.fn(),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await service.findAll(actor);

    expect(regionModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
    });
  });

  it('filters regions by tenant area when areaId is requested', async () => {
    const regionModel = {
      find: jest.fn((filter) => ({
        sort: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue([{ _id: 'region-1', ...filter }]),
        })),
      })),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await service.findAll(actor, '507f1f77bcf86cd799439011');

    expect(areaModel.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      tenantId: 'tenant-frittenwerk',
    });
    expect(regionModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
    });
  });

  it('blocks non tenant admins from tenant region management', async () => {
    const serviceUser = {
      ...actor,
      roles: ['Service'],
    };
    accessPolicy.isCompanyAdmin.mockReturnValueOnce(false);
    const regionModel = {
      find: jest.fn(),
    };
    const areaModel = {
      findOne: jest.fn(),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await expect(service.findAll(serviceUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(regionModel.find).not.toHaveBeenCalled();
  });

  it('physically deletes regions without dependencies for tenant admins', async () => {
    const region = {
      _id: { toString: () => '507f1f77bcf86cd799439012' },
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      name: 'Rheinland',
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
      deleteOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      })),
    };
    const areaModel = {
      findOne: jest.fn(() => createQuery(area)),
    };
    const service = new RegionsService(
      regionModel as never,
      areaModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await expect(
      service.remove('507f1f77bcf86cd799439012', actor),
    ).resolves.toEqual({
      deleted: true,
      regionId: '507f1f77bcf86cd799439012',
    });

    expect(regionModel.deleteOne).toHaveBeenCalledWith({
      _id: region._id,
      tenantId: 'tenant-frittenwerk',
    });
  });

  it('blocks region deletion when cities are assigned', async () => {
    const region = {
      _id: { toString: () => '507f1f77bcf86cd799439012' },
      tenantId: 'tenant-frittenwerk',
      areaId: '507f1f77bcf86cd799439011',
      name: 'Rheinland',
    };
    const regionModel = {
      findOne: jest.fn(() => createQuery(region)),
      deleteOne: jest.fn(),
    };
    const cityModel = {
      countDocuments: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(1),
      })),
    };
    const service = new RegionsService(
      regionModel as never,
      emptyModel as never,
      cityModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    await expect(
      service.remove('507f1f77bcf86cd799439012', actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(regionModel.deleteOne).not.toHaveBeenCalled();
  });
});
