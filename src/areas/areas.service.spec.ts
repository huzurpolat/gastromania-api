import { ConflictException } from '@nestjs/common';
import { AreasService } from './areas.service';

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
  permissions: ['regions.view', 'regions.create', 'regions.update'],
};

describe('AreasService', () => {
  const createQuery = (value: unknown) => ({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  const accessPolicy = {
    isCompanyAdmin: jest.fn((user) => user.roles.includes('TenantAdmin')),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const regionModel = {
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    exists: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue(null),
    })),
  };
  const userModel = {
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
  };
  const countModel = {
    countDocuments: jest.fn().mockResolvedValue(0),
  };

  it('creates areas only in the actor tenant', async () => {
    const areaModel = {
      findOne: jest.fn(() => createQuery(null)),
      create: jest.fn((payload) => Promise.resolve(payload)),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    const created = await service.create(
      { name: 'NRW', description: 'West' },
      actor,
    );

    expect(areaModel.create).toHaveBeenCalledWith({
      name: 'NRW',
      description: 'West',
      tenantId: 'tenant-frittenwerk',
      isActive: true,
    });
    expect(created).toMatchObject({ tenantId: 'tenant-frittenwerk' });
  });

  it('rejects duplicate area names within the same tenant', async () => {
    const areaModel = {
      findOne: jest.fn(() => createQuery({ _id: 'area-1' })),
      create: jest.fn(),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    await expect(service.create({ name: 'NRW' }, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(areaModel.create).not.toHaveBeenCalled();
  });

  it('lists all areas from the tenant admin tenant', async () => {
    const areaModel = {
      find: jest.fn((filter) => ({
        sort: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue([{ _id: 'area-nrw', ...filter }]),
        })),
      })),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    await service.findAll(actor);

    expect(areaModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
    });
  });

  it('attaches tenant regions when includeRegions is requested', async () => {
    const areaDocument = {
      _id: { toString: () => 'area-nrw' },
      tenantId: 'tenant-frittenwerk',
      name: 'NRW',
      toObject: () => ({
        _id: 'area-nrw',
        tenantId: 'tenant-frittenwerk',
        name: 'NRW',
      }),
    };
    const areaModel = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue([areaDocument]),
        })),
      })),
    };
    const scopedRegionModel = {
      find: jest.fn((filter) => ({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            _id: 'region-rheinland',
            tenantId: 'tenant-frittenwerk',
            areaId: 'area-nrw',
            name: 'Rheinland',
            isActive: true,
            filter,
          },
        ]),
      })),
    };
    const service = new AreasService(
      areaModel as never,
      scopedRegionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    const areas = await service.findAll(actor, true);

    expect(scopedRegionModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-frittenwerk',
      areaId: { $in: ['area-nrw'] },
    });
    expect(areas).toEqual([
      expect.objectContaining({
        _id: 'area-nrw',
        regions: [
          expect.objectContaining({
            _id: 'region-rheinland',
            name: 'Rheinland',
          }),
        ],
      }),
    ]);
  });

  it('does not expose areas to non tenant admins', async () => {
    const serviceUser = {
      ...actor,
      roles: ['Service'],
    };
    const areaModel = {
      find: jest.fn(),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    const areas = await service.findAll(serviceUser);

    expect(areas).toEqual([]);
    expect(areaModel.find).not.toHaveBeenCalled();
  });

  it('assigns tenant users to an area', async () => {
    const areaDocument = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      tenantId: 'tenant-frittenwerk',
    };
    const areaModel = {
      findById: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(areaDocument),
      })),
    };
    const scopedUserModel = {
      findOne: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439012',
          tenantId: 'tenant-frittenwerk',
          areaIds: [],
        }),
      })),
      findByIdAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(null),
      })),
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            _id: { toString: () => '507f1f77bcf86cd799439012' },
            email: 'user@frittenwerk-demo.demo',
            roles: ['Service'],
            status: 'active',
            isActive: true,
          },
        ]),
      })),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      scopedUserModel as never,
      accessPolicy as never,
    );

    const users = await service.assignUser(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
      actor,
    );

    expect(scopedUserModel.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439012',
      tenantId: 'tenant-frittenwerk',
    });
    expect(scopedUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      { areaIds: ['507f1f77bcf86cd799439011'] },
      { new: true, runValidators: true },
    );
    expect(users).toEqual([
      expect.objectContaining({
        email: 'user@frittenwerk-demo.demo',
        role: 'Service',
      }),
    ]);
  });

  it('soft deletes areas for tenant admins', async () => {
    const areaDocument = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      tenantId: 'tenant-frittenwerk',
      name: 'NRW',
      toObject: () => ({
        _id: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-frittenwerk',
        name: 'NRW',
        isActive: false,
      }),
    };
    const areaModel = {
      findById: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(areaDocument),
      })),
      findByIdAndUpdate: jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(areaDocument),
      })),
    };
    const service = new AreasService(
      areaModel as never,
      regionModel as never,
      countModel as never,
      countModel as never,
      userModel as never,
      accessPolicy as never,
    );

    await service.remove('507f1f77bcf86cd799439011', actor);

    expect(areaModel.findByIdAndUpdate).toHaveBeenCalledWith(
      areaDocument._id,
      { isActive: false },
      { new: true, runValidators: true },
    );
  });
});
