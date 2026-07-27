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
    doc('bonn', { tenantId: 'tenant-nrw', companyId: 'gastro', areaId: 'rheinland', regionId: 'nrw' }),
    doc('essen', { tenantId: 'tenant-nrw', companyId: 'gastro', areaId: 'ruhrgebiet', regionId: 'nrw' }),
    doc('frankfurt', { tenantId: 'tenant-hessen', companyId: 'gastro', areaId: 'rheinmain', regionId: 'hessen' }),
    doc('mitte', { tenantId: 'tenant-berlin', companyId: 'gastro', areaId: 'berlin-city', regionId: 'berlin' }),
    doc('muenchen', { tenantId: 'tenant-bayern', companyId: 'gastro', areaId: 'muenchen', regionId: 'bayern' }),
  ];
  const regions = [
    doc('nrw', { tenantId: 'tenant-nrw', companyId: 'gastro', areaId: 'rheinland' }),
    doc('hessen', { tenantId: 'tenant-hessen', companyId: 'gastro', areaId: 'rheinmain' }),
    doc('berlin', { tenantId: 'tenant-berlin', companyId: 'gastro', areaId: 'berlin-city' }),
    doc('bayern', { tenantId: 'tenant-bayern', companyId: 'gastro', areaId: 'muenchen' }),
  ];
  const areas = [
    doc('rheinland', { tenantId: 'tenant-nrw' }),
    doc('ruhrgebiet', { tenantId: 'tenant-nrw' }),
    doc('rheinmain', { tenantId: 'tenant-hessen' }),
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
            locations.filter(
              (location) => location.companyId === filter.companyId,
            ),
          );
        }

        if (filter.tenantId) {
          return query(
            locations.filter(
              (location) => location.tenantId === filter.tenantId,
            ),
          );
        }

        const areaFilter = filter.areaId as { $in?: string[] } | undefined;
        if (areaFilter?.$in) {
          return query(
            locations.filter((location) =>
              areaFilter.$in?.includes(location.areaId as string),
            ),
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
    const areaModel = {
      findById: jest.fn((id: string) =>
        query(areas.find((area) => area._id.toString() === id) ?? null),
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
      areaModel as never,
      {} as never,
      departmentModel as never,
      regionModel as never,
      locationModel as never,
      {} as never,
    );
  });

  it('scopes region and location roles to their assigned hierarchy', async () => {
    await expect(
      service.getReadableLocationIds(
        user([Role.RegionAdmin], {
          regionIds: ['nrw'],
        }),
      ),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.canAccessLocation(
        user([Role.RegionAdmin], { regionIds: ['bayern'] }),
        'bonn',
      ),
    ).resolves.toBe(false);
    await expect(
      service.getReadableLocationIds(
        user([Role.Bereichsleiter], {
          locationIds: ['bonn', 'essen'],
          managedLocationIds: ['bonn', 'essen'],
        }),
      ),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.getReadableLocationIds(
        user([Role.Service], { locationIds: ['bonn'] }),
      ),
    ).resolves.toEqual(['bonn']);
  });

  it('covers the accepted scope matrix for platform, region, area, branch and operative roles', async () => {
    await expect(
      service.getReadableLocationIds(user([Role.PlatformAdmin])),
    ).resolves.toEqual(['bonn', 'essen', 'frankfurt', 'mitte', 'muenchen']);
    await expect(
      service.getReadableLocationIds(
        user([Role.Regionalleiter], { regionIds: ['nrw'] }),
      ),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.getReadableLocationIds(
        user([Role.Bereichsleiter], {
          areaIds: ['rheinland'],
        }),
      ),
    ).resolves.toEqual(['bonn']);
    await expect(
      service.getReadableLocationIds(
        user([Role.Filialleiter], {
          locationIds: ['bonn', 'essen'],
          managedLocationIds: ['bonn', 'essen'],
        }),
      ),
    ).resolves.toEqual(['bonn', 'essen']);
    await expect(
      service.getReadableLocationIds(
        user([Role.Service], { locationIds: ['bonn'] }),
      ),
    ).resolves.toEqual(['bonn']);
  });

  it('rejects direct access to foreign locations', async () => {
    const serviceUser = user([Role.Service], { locationIds: ['bonn'] });

    await expect(
      service.canAccessLocation(serviceUser, 'frankfurt'),
    ).resolves.toBe(false);
    await expect(
      service.getScopedResourceFilter(serviceUser, 'frankfurt'),
    ).rejects.toThrow('Kein Zugriff auf diesen Standort');
  });

  it('prevents lower roles from assigning higher roles', () => {
    expect(
      service.canAssignRole(
        user([Role.PlatformAdmin]),
        Role.TenantAdmin,
      ),
    ).toBe(true);
    expect(
      service.canAssignRole(
        user([Role.PlatformAdmin]),
        Role.PlatformAdmin,
      ),
    ).toBe(false);
    expect(
      service.canAssignRole(
        user([Role.CompanyAdmin], { companyId: 'gastro' }),
        Role.PlatformAdmin,
      ),
    ).toBe(false);
    expect(
      service.canAssignRole(
        user([Role.Regionalleiter], { regionIds: ['nrw'] }),
        Role.CompanyAdmin,
      ),
    ).toBe(false);
    expect(
      service.canAssignRole(
        user([Role.Bereichsleiter], {
          locationIds: ['bonn'],
          managedLocationIds: ['bonn'],
        }),
        Role.Regionalleiter,
      ),
    ).toBe(false);
    expect(
      service.canAssignRole(
        user([Role.Filialleiter], {
          locationIds: ['bonn'],
          managedLocationIds: ['bonn'],
        }),
        Role.Bereichsleiter,
      ),
    ).toBe(false);
  });

  it('limits scoped LOCATION_MANAGER users to their managed assignment locations and operative roles', async () => {
    const locationManager = user([Role.Staff, Role.Filialleiter], {
      tenantId: 'tenant-nrw',
      locationIds: ['bonn', 'essen'],
      locationAssignments: [
        { locationId: 'bonn', role: Role.LocationManager, isPrimary: true },
        { locationId: 'essen', role: Role.Waiter, isPrimary: false },
      ],
    });

    expect(service.isScopedLocationManager(locationManager)).toBe(true);
    await expect(
      service.getManageableLocationIds(locationManager),
    ).resolves.toEqual(['bonn']);
    expect(service.canAssignRole(locationManager, Role.Waiter)).toBe(true);
    expect(service.canAssignRole(locationManager, Role.Kitchen)).toBe(true);
    expect(service.canAssignRole(locationManager, Role.LocationManager)).toBe(
      false,
    );
    expect(service.canAssignRole(locationManager, Role.TenantAdmin)).toBe(false);
  });

  it('enforces the user-management hierarchy by role and scope', async () => {
    await expect(
      service.canManageUser(
        user([Role.RegionAdmin], { companyId: 'gastro', regionIds: ['nrw'] }),
        {
          roles: [Role.Regionalleiter],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['bonn'],
          managedLocationIds: [],
        } as never,
      ),
    ).resolves.toBe(true);
    await expect(
      service.canManageUser(
        user([Role.Regionalleiter], {
          companyId: 'gastro',
          regionIds: ['nrw'],
        }),
        {
          roles: [Role.CompanyAdmin],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['bonn'],
          managedLocationIds: [],
        } as never,
      ),
    ).resolves.toBe(false);
    await expect(
      service.canManageUser(
        user([Role.Bereichsleiter], {
          companyId: 'gastro',
          locationIds: ['bonn', 'essen'],
          managedLocationIds: ['bonn', 'essen'],
        }),
        {
          roles: [Role.Filialleiter],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['essen'],
          managedLocationIds: ['essen'],
        } as never,
      ),
    ).resolves.toBe(true);
    await expect(
      service.canManageUser(
        user([Role.Filialleiter], {
          companyId: 'gastro',
          locationIds: ['bonn', 'essen'],
          managedLocationIds: ['bonn', 'essen'],
        }),
        {
          roles: [Role.Service],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['essen'],
          managedLocationIds: [],
        } as never,
      ),
    ).resolves.toBe(true);
    await expect(
      service.canManageUser(
        user([Role.Service], { companyId: 'gastro', locationIds: ['bonn'] }),
        {
          roles: [Role.Schichtleiter],
          companyId: 'gastro',
          regionIds: ['nrw'],
          locationIds: ['bonn'],
          managedLocationIds: [],
        } as never,
      ),
    ).resolves.toBe(false);
  });

  it('lets scoped LOCATION_MANAGER users manage employees sharing one own location only', async () => {
    const locationManager = user([Role.Staff, Role.Filialleiter], {
      tenantId: 'tenant-nrw',
      locationIds: ['bonn', 'essen'],
      locationAssignments: [
        { locationId: 'bonn', role: Role.LocationManager, isPrimary: true },
        { locationId: 'essen', role: Role.Waiter, isPrimary: false },
      ],
    });

    await expect(
      service.canManageUser(locationManager, {
        roles: [Role.Service],
        tenantId: 'tenant-nrw',
        locationIds: ['bonn', 'essen'],
        managedLocationIds: [],
      } as never),
    ).resolves.toBe(true);
    await expect(
      service.canManageUser(locationManager, {
        roles: [Role.Service],
        tenantId: 'tenant-nrw',
        locationIds: ['essen'],
        managedLocationIds: [],
      } as never),
    ).resolves.toBe(false);
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
