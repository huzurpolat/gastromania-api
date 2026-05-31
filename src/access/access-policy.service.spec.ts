import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AccessPolicyService } from './access-policy.service';

const doc = (id: string, extras: Record<string, unknown> = {}) => ({
  _id: { toString: () => id },
  ...extras,
});

const query = <T>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('AccessPolicyService', () => {
  const locations = [
    doc('bonn', { companyId: 'gastro', regionId: 'nrw' }),
    doc('essen', { companyId: 'gastro', regionId: 'nrw' }),
    doc('frankfurt', { companyId: 'gastro', regionId: 'hessen' }),
    doc('mitte', { companyId: 'gastro', regionId: 'berlin' }),
    doc('muenchen', { companyId: 'gastro', regionId: 'bayern' }),
  ];
  const regions = [
    doc('nrw', { companyId: 'gastro' }),
    doc('hessen', { companyId: 'gastro' }),
    doc('berlin', { companyId: 'gastro' }),
    doc('bayern', { companyId: 'gastro' }),
  ];

  let service: AccessPolicyService;

  beforeEach(() => {
    const locationModel = {
      find: jest.fn((filter: Record<string, unknown>) => {
        if (!Object.keys(filter).length) {
          return query(locations);
        }

        if (filter.companyId) {
          return query(
            locations.filter((location) => location.companyId === filter.companyId),
          );
        }

        const regionFilter = filter.regionId as { $in?: string[] } | undefined;
        if (regionFilter?.$in) {
          return query(
            locations.filter((location) =>
              regionFilter.$in?.includes(location.regionId as string),
            ),
          );
        }

        return query([]);
      }),
    };
    const regionModel = {
      findById: jest.fn((id: string) =>
        query(regions.find((region) => region._id.toString() === id) ?? null),
      ),
    };
    const departmentModel = {
      findById: jest.fn((id: string) =>
        query(
          id === 'service-bonn'
            ? { companyId: 'gastro', locationId: 'bonn' }
            : null,
        ),
      ),
    };

    service = new AccessPolicyService(
      {} as never,
      departmentModel as never,
      regionModel as never,
      locationModel as never,
      {} as never,
    );
  });

  it('scopes region and location roles to their assigned hierarchy', async () => {
    await expect(
      service.getReadableLocationIds(user([Role.RegionAdmin], {
        regionIds: ['nrw'],
      })),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.canAccessLocation(
        user([Role.RegionAdmin], { regionIds: ['bayern'] }),
        'bonn',
      ),
    ).resolves.toBe(false);
    await expect(
      service.getReadableLocationIds(user([Role.Bereichsleiter], {
        locationIds: ['bonn', 'essen'],
        managedLocationIds: ['bonn', 'essen'],
      })),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.getReadableLocationIds(user([Role.Service], { locationIds: ['bonn'] })),
    ).resolves.toEqual(['bonn']);
  });

  it('allows platform admins globally and blocks lower roles from managing higher roles', async () => {
    await expect(
      service.getReadableLocationIds(user([Role.PlatformAdmin])),
    ).resolves.toEqual(['bonn', 'essen', 'frankfurt', 'mitte', 'muenchen']);

    await expect(
      service.canManageUser(
        user([Role.Filialleiter], {
          locationIds: ['bonn', 'essen'],
          managedLocationIds: ['bonn', 'essen'],
        }),
        {
          roles: [Role.Regionalleiter],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['bonn'],
          managedLocationIds: ['bonn', 'essen'],
        } as never,
      ),
    ).resolves.toBe(false);
  });

  it('validates assignable departments through the location scope', async () => {
    await expect(
      service.canAssignDepartment(
        user([Role.Bereichsleiter], {
          companyId: 'gastro',
          locationIds: ['bonn'],
          managedLocationIds: ['bonn'],
        }),
        'service-bonn',
      ),
    ).resolves.toBe(true);
    await expect(
      service.canAssignDepartment(
        user([Role.Bereichsleiter], {
          companyId: 'gastro',
          locationIds: ['essen'],
          managedLocationIds: ['essen'],
        }),
        'service-bonn',
      ),
    ).resolves.toBe(false);
  });
});

function user(
  roles: Role[],
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    sub: 'actor',
    email: 'actor@example.test',
    roles,
    companyId: 'gastro',
    regionIds: [],
    locationIds: [],
    managedLocationIds: [],
    permissions: [],
    ...overrides,
  };
}
