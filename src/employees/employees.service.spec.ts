import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  const usersService = {
    findAll: jest.fn(),
  };

  const service = new EmployeesService(usersService as never);
  const actor = { sub: 'tenant-admin', roles: ['TenantAdmin'] } as never;

  beforeEach(() => {
    usersService.findAll.mockReset();
  });

  it('filters employees by assigned location', async () => {
    usersService.findAll.mockResolvedValue([
      {
        _id: 'user-1',
        email: 'service@example.test',
        firstName: 'Ser',
        lastName: 'Vice',
        roles: ['Service'],
        locationAssignments: [
          {
            _id: 'assignment-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            locationId: 'location-2',
            role: 'WAITER',
            isPrimary: false,
          },
        ],
      },
      {
        _id: 'user-2',
        email: 'other@example.test',
        firstName: 'Ot',
        lastName: 'Her',
        roles: ['Service'],
        locationIds: ['location-1'],
      },
    ]);

    const result = await service.findAll(actor, { locationId: 'location-2' });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('user-1');
  });

  it('filters employees by per-location role assignment', async () => {
    usersService.findAll.mockResolvedValue([
      {
        _id: 'user-1',
        email: 'counter@example.test',
        firstName: 'Coun',
        lastName: 'Ter',
        roles: ['Service'],
        locationAssignments: [
          {
            _id: 'assignment-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            locationId: 'location-1',
            role: 'COUNTER',
            isPrimary: true,
          },
        ],
      },
      {
        _id: 'user-2',
        email: 'service@example.test',
        firstName: 'Ser',
        lastName: 'Vice',
        roles: ['Service'],
        locationAssignments: [],
      },
    ]);

    const result = await service.findAll(actor, { role: 'COUNTER' });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('user-1');
  });
});
