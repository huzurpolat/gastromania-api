import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { LocationDocument } from '../locations/schemas/location.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantTableDocument, TableStatus } from './schemas/table.schema';
import { TablesService } from './tables.service';

const locationId = new Types.ObjectId().toString();
const floorId = `${locationId}:eg`;
const actor = {
  sub: 'user-1',
  roles: ['Filialleiter'],
  companyId: 'company-1',
  regionIds: ['region-1'],
} as AuthenticatedUser;

function queryResult<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function locationQuery(floors = ['EG']) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      _id: locationId,
      tablePlanFloors: floors,
    } satisfies Partial<LocationDocument>),
  };
}

function createService(
  options: {
    existingTableNames?: string[];
    locationFloors?: string[];
  } = {},
) {
  const createdTables: Array<Partial<RestaurantTableDocument>> = [];
  const existingTableNames = new Set(options.existingTableNames ?? []);
  const tableModel = {
    create: jest.fn((payload: Partial<RestaurantTableDocument>) => {
      createdTables.push(payload);
      existingTableNames.add(payload.name ?? '');
      return Promise.resolve({
        _id: new Types.ObjectId().toString(),
        ...payload,
      });
    }),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue(queryResult([])),
    }),
    countDocuments: jest.fn().mockResolvedValue(0),
    exists: jest.fn((filter: { name?: string }) =>
      Promise.resolve(
        filter.name && existingTableNames.has(filter.name)
          ? { _id: 'existing' }
          : null,
      ),
    ),
  };
  const locationModel = {
    findById: jest.fn().mockReturnValue(locationQuery(options.locationFloors)),
  };
  const accessPolicy = {
    assertCanManageLocation: jest.fn().mockResolvedValue(undefined),
    getScopedResourceFilter: jest.fn().mockResolvedValue({ locationId }),
  };

  const service = new TablesService(
    tableModel as never,
    locationModel as never,
    {} as never,
    {} as never,
    accessPolicy as unknown as AccessPolicyService,
    { publish: jest.fn() } as unknown as RealtimeService,
  );

  return { service, tableModel, createdTables, accessPolicy };
}

describe('TablesService floor handling', () => {
  it('creates a table with a resolved floorId', async () => {
    const { service, tableModel } = createService();

    await service.create(
      {
        name: 'Tisch 12',
        locationId,
        seats: 4,
        floorId,
      },
      actor,
    );

    expect(tableModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        floorId,
        floorName: 'EG',
        planFloor: 'EG',
      }),
    );
  });

  it('rejects a table without a floor reference', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          name: 'Tisch ohne Etage',
          locationId,
          seats: 4,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters tables by floorId', async () => {
    const { service, tableModel } = createService();

    await service.findAll(actor, locationId, floorId);

    expect(tableModel.find).toHaveBeenCalledWith({
      locationId,
      floorId,
    });
  });

  it('creates three start tables for an empty floor', async () => {
    const { service, createdTables } = createService({
      existingTableNames: ['Tisch 1'],
    });

    const tables = await service.createStartTablesForFloor(
      actor,
      locationId,
      floorId,
    );

    expect(tables).toHaveLength(3);
    expect(createdTables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Tisch 1 (2)',
          floorId,
          floorName: 'EG',
          planX: 8,
          planY: 8,
          status: TableStatus.Free,
        }),
        expect.objectContaining({
          name: 'Tisch 2',
          floorId,
          planX: 26,
          planY: 8,
        }),
        expect.objectContaining({
          name: 'Tisch 3',
          floorId,
          planX: 44,
          planY: 8,
        }),
      ]),
    );
  });
});
