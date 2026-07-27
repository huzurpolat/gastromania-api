import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import {
  ReservationSource,
  ReservationStatus,
} from './schemas/reservation.schema';
import { GuestsService } from '../guests/guests.service';

describe('ReservationsService', () => {
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view', 'reservations.create'],
  };

  const baseReservation = {
    _id: 'reservation-1',
    tenantId: 'tenant-1',
    locationId: '507f1f77bcf86cd799439011',
    tableId: '507f1f77bcf86cd799439012',
    guestName: 'Max Mustermann',
    partySize: 2,
    guestCount: 2,
    startTime: new Date('2026-06-13T18:00:00.000Z'),
    endTime: new Date('2026-06-13T20:00:00.000Z'),
    status: ReservationStatus.Reserved,
  };

  function createService(options: { conflict?: boolean; seats?: number } = {}) {
    const created: unknown[] = [];
    const updated: unknown[] = [];
    const reservationModel = {
      create: jest.fn(async (payload) => {
        created.push(payload);
        return { _id: 'created-1', ...payload };
      }),
      findOne: jest.fn(() => ({
        exec: jest.fn(async () => (options.conflict ? baseReservation : null)),
      })),
      findById: jest.fn(() => ({
        exec: jest.fn(async () => baseReservation),
      })),
      findByIdAndUpdate: jest.fn((_id, payload) => ({
        exec: jest.fn(async () => {
          updated.push(payload);
          return { ...baseReservation, ...payload };
        }),
      })),
    };
    const tableModel = {
      findById: jest.fn(() => ({
        lean: jest.fn(async () => ({
          _id: baseReservation.tableId,
          tenantId: 'tenant-1',
          locationId: baseReservation.locationId,
          name: 'Tisch 1',
          seats: options.seats ?? 4,
          isActive: true,
        })),
      })),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn(async () => [
            {
              _id: baseReservation.tableId,
              tenantId: 'tenant-1',
              locationId: baseReservation.locationId,
              name: 'Tisch 1',
              seats: options.seats ?? 4,
              isActive: true,
            },
          ]),
        })),
      })),
    };
    const accessPolicy = {
      assertCanAccessLocation: jest.fn(async () => undefined),
      canAccessLocation: jest.fn(async () => true),
      getScopedResourceFilter: jest.fn(async (_actor, locationId) => ({
        locationId,
      })),
    };
    const guestsService = {
      findOrCreateFromContact: jest.fn(async () => ({
        _id: '64f000000000000000000099',
      })),
    };
    const service = new ReservationsService(
      reservationModel as never,
      tableModel as never,
      accessPolicy as never,
      guestsService as unknown as GuestsService,
    );
    return { service, reservationModel, tableModel, accessPolicy, created, updated };
  }

  it('creates a tenant-scoped reservation with reservation number and source', async () => {
    const { service, created } = createService();

    const reservation = await service.create(
      {
        locationId: baseReservation.locationId,
        tableId: baseReservation.tableId,
        guestName: 'Max Mustermann',
        partySize: 2,
        startTime: '2026-06-13T18:00:00.000Z',
        endTime: '2026-06-13T20:00:00.000Z',
        source: ReservationSource.Phone,
      },
      actor as never,
    );

    expect(reservation.status).toBe(ReservationStatus.Reserved);
    expect(reservation.tenantId).toBe('tenant-1');
    expect(reservation.reservationNumber).toMatch(/^RSV-/);
    expect(created[0]).toMatchObject({
      source: ReservationSource.Phone,
      createdByUserId: 'user-1',
    });
  });

  it('blocks overlapping reservations for the same table', async () => {
    const { service } = createService({ conflict: true });

    await expect(
      service.create(
        {
          locationId: baseReservation.locationId,
          tableId: baseReservation.tableId,
          guestName: 'Max Mustermann',
          partySize: 2,
          startTime: '2026-06-13T18:30:00.000Z',
          endTime: '2026-06-13T19:00:00.000Z',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks tables with insufficient seats', async () => {
    const { service } = createService({ seats: 2 });

    await expect(
      service.create(
        {
          locationId: baseReservation.locationId,
          tableId: baseReservation.tableId,
          guestName: 'Max Mustermann',
          partySize: 4,
          startTime: '2026-06-13T18:00:00.000Z',
          endTime: '2026-06-13T20:00:00.000Z',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks reservations as checked in and no-show without deleting them', async () => {
    const { service, updated } = createService();

    await service.checkIn('507f1f77bcf86cd799439013', actor as never);
    await service.markNoShow('507f1f77bcf86cd799439013', actor as never);

    expect(updated).toEqual([
      { status: ReservationStatus.CheckedIn },
      { status: ReservationStatus.NoShow },
    ]);
  });
});
