import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WaitlistService } from './waitlist.service';
import { AccessPolicyService } from '../access/access-policy.service';
import { GuestsService } from '../guests/guests.service';
import {
  WaitlistEntry,
  WaitlistStatus,
} from './schemas/waitlist-entry.schema';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { Reservation } from '../reservations/schemas/reservation.schema';
import { ReservationsService } from '../reservations/reservations.service';

const actor = {
  sub: 'user-1',
  tenantId: 'tenant-1',
  roles: ['TenantAdmin'],
  locationIds: ['64f000000000000000000001'],
};

function doc<T extends Record<string, unknown>>(value: T): T & {
  toObject: () => T;
} {
  return { ...value, toObject: () => value };
}

describe('WaitlistService', () => {
  let service: WaitlistService;
  let waitlistRows: Array<Record<string, unknown>>;
  let tableRows: Array<Record<string, unknown>>;
  let reservationRows: Array<Record<string, unknown>>;

  const accessPolicy = {
    assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
    canAccessLocation: jest.fn().mockResolvedValue(true),
    getScopedResourceFilter: jest.fn().mockImplementation((_, locationId) =>
      Promise.resolve(locationId ? { locationId } : { locationId: { $in: actor.locationIds } }),
    ),
  };

  beforeEach(async () => {
    waitlistRows = [];
    tableRows = [
      doc({
        _id: '64f000000000000000000010',
        tenantId: actor.tenantId,
        locationId: actor.locationIds[0],
        name: 'Tisch 1',
        seats: 4,
        isActive: true,
        status: TableStatus.Free,
      }),
    ];
    reservationRows = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        WaitlistService,
        { provide: ReservationsService, useValue: { create: jest.fn() } },
        {
          provide: GuestsService,
          useValue: {
            findOrCreateFromContact: jest.fn().mockResolvedValue({
              _id: '64f000000000000000000099',
            }),
          },
        },
        { provide: AccessPolicyService, useValue: accessPolicy },
        {
          provide: getModelToken(WaitlistEntry.name),
          useValue: {
            create: jest.fn(async (payload) => doc({ _id: entryId, ...payload })),
            countDocuments: jest.fn(async () => waitlistRows.length),
            find: jest.fn((query) => ({
              sort: () => ({
                exec: async () =>
                  waitlistRows
                    .filter((row) => !query.status || row['status'] === query.status)
                    .map((row) => doc(row)),
              }),
            })),
            findById: jest.fn((id) => ({
              exec: async () =>
                waitlistRows.find((row) => row['_id'] === id)
                  ? doc(waitlistRows.find((row) => row['_id'] === id)!)
                  : null,
            })),
            findByIdAndUpdate: jest.fn((id, payload) => ({
              exec: async () => {
                const row = waitlistRows.find((item) => item['_id'] === id);
                if (!row) return null;
                Object.assign(row, payload);
                return doc(row);
              },
            })),
            aggregate: jest.fn(async () => [{ total: 0, average: 0 }]),
          },
        },
        {
          provide: getModelToken(RestaurantTable.name),
          useValue: {
            find: jest.fn((query) => ({
              sort: () => ({
                lean: async () =>
                  tableRows.filter(
                    (table) =>
                      table['locationId'] === query.locationId &&
                      table['isActive'] &&
                      Number(table['seats']) >= query.seats.$gte &&
                      query.status.$in.includes(table['status']),
                  ),
              }),
            })),
            findById: jest.fn((id) => ({
              exec: async () =>
                tableRows.find((row) => row['_id'] === id)
                  ? doc(tableRows.find((row) => row['_id'] === id)!)
                  : null,
            })),
            findByIdAndUpdate: jest.fn((id, payload) => ({
              exec: async () => {
                const table = tableRows.find((row) => row['_id'] === id);
                if (table) Object.assign(table, payload);
                return table ? doc(table) : null;
              },
            })),
          },
        },
        {
          provide: getModelToken(Reservation.name),
          useValue: {
            exists: jest.fn(async (query) =>
              reservationRows.some(
                (row) =>
                  row['tableId'] === query.tableId &&
                  row['locationId'] === query.locationId,
              ),
            ),
            findOne: jest.fn(() => ({
              sort: () => ({
                select: () => ({
                  lean: async () => null,
                }),
              }),
            })),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(WaitlistService);
  });

  it('creates a walk-in with immediate table availability', async () => {
    const entry = await service.create(
      {
        locationId: actor.locationIds[0],
        guestName: 'Familie Mueller',
        guestCount: 3,
      },
      actor as never,
    );

    expect(entry.estimatedWaitMinutes).toBe(0);
    expect(entry.status).toBe(WaitlistStatus.Waiting);
  });

  it('returns table suggestions for waiting entries', async () => {
    waitlistRows.push({
      _id: entryId,
      tenantId: actor.tenantId,
      locationId: actor.locationIds[0],
      guestName: 'Familie Mueller',
      guestCount: 3,
      status: WaitlistStatus.Waiting,
    });

    const entries = await service.findAll(actor as never, {
      locationId: actor.locationIds[0],
    });

    expect(entries[0].tableSuggestions?.[0]).toMatchObject({
      tableId: '64f000000000000000000010',
      tableName: 'Tisch 1',
    });
  });

  it('seats a waiting entry and occupies the table', async () => {
    waitlistRows.push({
      _id: entryId,
      tenantId: actor.tenantId,
      locationId: actor.locationIds[0],
      guestName: 'Familie Mueller',
      guestCount: 3,
      status: WaitlistStatus.Waiting,
    });

    const entry = await service.seat(entryId, actor as never);

    expect(entry.status).toBe(WaitlistStatus.Seated);
    expect(tableRows[0]['status']).toBe(TableStatus.OccupiedState);
  });

  it('blocks seating when a current reservation uses the table', async () => {
    waitlistRows.push({
      _id: entryId,
      tenantId: actor.tenantId,
      locationId: actor.locationIds[0],
      guestName: 'Familie Mueller',
      guestCount: 3,
      status: WaitlistStatus.Waiting,
      preferredTableId: '64f000000000000000000010',
    });
    reservationRows.push({
      tableId: '64f000000000000000000010',
      locationId: actor.locationIds[0],
    });

    await expect(service.seat(entryId, actor as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
  const entryId = '64f000000000000000000020';
