import { NotFoundException } from '@nestjs/common';
import { GuestsService } from './guests.service';

describe('GuestsService', () => {
  const missingId = '507f1f77bcf86cd799439099';
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view', 'reservations.create'],
  };

  function createService(existingGuest?: Record<string, unknown> | null) {
    const created: unknown[] = [];
    const updated: unknown[] = [];
    const saved: unknown[] = [];
    const existing = existingGuest
      ? {
          ...existingGuest,
          save: jest.fn(async function save(this: unknown) {
            saved.push(this);
            return this;
          }),
        }
      : null;
    const guestModel = {
      findOne: jest.fn(() => ({
        exec: jest.fn(async () => existing),
      })),
      create: jest.fn(async (payload) => {
        created.push(payload);
        return { _id: 'guest-1', ...payload };
      }),
      findById: jest.fn((id) => ({
        exec: jest.fn(async () =>
          id === missingId
            ? null
            : {
                _id: id,
                tenantId: 'tenant-1',
                locationId: 'location-1',
                firstName: 'Max',
                lastName: 'Mustermann',
              },
        ),
      })),
      findByIdAndUpdate: jest.fn((id, payload) => ({
        exec: jest.fn(async () => {
          updated.push(payload);
          return id === missingId
            ? null
            : {
                _id: id,
                tenantId: 'tenant-1',
                active: payload.active ?? true,
              };
        }),
      })),
    };
    const accessPolicy = {
      assertCanAccessLocation: jest.fn(async () => undefined),
      canAccessLocation: jest.fn(async () => true),
      getScopedResourceFilter: jest.fn(async () => ({})),
    };
    const emptyModel = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn(async () => []),
        })),
        select: jest.fn(() => ({
          lean: jest.fn(async () => []),
        })),
      })),
      aggregate: jest.fn(async () => []),
      findOne: jest.fn(() => ({
        sort: jest.fn(() => ({
          select: jest.fn(() => ({
            lean: jest.fn(async () => null),
          })),
        })),
      })),
    };

    const service = new GuestsService(
      guestModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      emptyModel as never,
      accessPolicy as never,
    );

    return { service, guestModel, accessPolicy, created, updated, saved };
  }

  it('deduplicates guest profiles by normalized email', async () => {
    const { service, created } = createService({
      _id: 'guest-existing',
      tenantId: 'tenant-1',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.test',
      active: true,
    });

    const guest = await service.findOrCreateFromContact(
      {
        name: 'Max Mustermann',
        email: ' MAX@EXAMPLE.TEST ',
        phone: '+49 221 123',
      },
      actor as never,
    );

    expect(guest?._id).toBe('guest-existing');
    expect(created).toHaveLength(0);
  });

  it('creates a tenant-scoped profile from reservation or waitlist contact data', async () => {
    const { service, created, accessPolicy } = createService(null);

    const guest = await service.findOrCreateFromContact(
      {
        locationId: 'location-1',
        name: 'Anna Beispiel',
        email: 'ANNA@EXAMPLE.TEST',
        phone: '0221 / 555',
        preferredTableId: 'table-1',
      },
      actor as never,
    );

    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(
      actor,
      'location-1',
    );
    expect(guest).toMatchObject({ tenantId: 'tenant-1' });
    expect(created[0]).toMatchObject({
      tenantId: 'tenant-1',
      locationId: 'location-1',
      firstName: 'Anna',
      lastName: 'Beispiel',
      email: 'anna@example.test',
      phone: '0221555',
      preferredTableId: 'table-1',
      active: true,
    });
  });

  it('soft-deletes guest profiles instead of removing documents', async () => {
    const { service, updated } = createService(null);

    const result = await service.remove(
      '507f1f77bcf86cd799439011',
      actor as never,
    );

    expect(result.active).toBe(false);
    expect(updated[0]).toEqual({ active: false });
  });

  it('hides cross-tenant or missing profiles as not found', async () => {
    const { service } = createService(null);

    await expect(service.remove(missingId, actor as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
