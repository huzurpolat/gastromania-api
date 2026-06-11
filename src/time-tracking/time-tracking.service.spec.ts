import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessPolicyService } from '../access/access-policy.service';
import { TimeEntryStatus } from './schemas/time-entry.schema';
import { TimeTrackingService } from './time-tracking.service';

const tenantId = '6a2200000000000000000001';
const locationId = '6a2200000000000000000002';
const employeeId = '6a2200000000000000000003';
const shiftId = '6a2200000000000000000004';
const departmentId = '6a2200000000000000000006';

const execResolved = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });
const sortedExecResolved = <T>(value: T) => ({
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
});
const execAndSortedResolved = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
});

describe('TimeTrackingService', () => {
  let service: TimeTrackingService;
  let timeEntryModel: any;
  let timeEntryBreakModel: any;
  let correctionModel: any;
  let auditLogModel: any;
  let locationModel: any;
  let departmentModel: any;
  let userModel: any;
  let assignmentModel: any;
  let shiftModel: any;
  let absenceModel: any;
  let accessPolicy: jest.Mocked<
    Pick<
      AccessPolicyService,
      | 'isPlatformAdmin'
      | 'isCompanyAdmin'
      | 'isManagementRole'
      | 'isScopedLocationManager'
      | 'assertCanAccessLocation'
      | 'assertCanManageLocation'
      | 'canManageUser'
      | 'getScopedResourceFilter'
      | 'getManageableLocationIds'
    >
  >;

  const actor = {
    sub: employeeId,
    tenantId,
    roles: ['WAITER'],
  } as any;

  const employee = {
    _id: { toString: () => employeeId },
    tenantId,
    isActive: true,
    status: 'active',
    locationIds: [],
    roles: ['WAITER'],
  };

  const location = {
    _id: { toString: () => locationId },
    tenantId,
    locationId,
  };

  beforeEach(() => {
    timeEntryModel = {
      findOne: jest.fn(),
      create: jest.fn((payload) => Promise.resolve({ _id: 'entry-id', ...payload })),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    timeEntryBreakModel = {
      findOne: jest.fn().mockReturnValue(execResolved(null)),
      create: jest.fn((payload) =>
        Promise.resolve({ _id: 'break-id', ...payload }),
      ),
      find: jest.fn().mockReturnValue(execAndSortedResolved([])),
    };
    correctionModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    auditLogModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    locationModel = {
      findById: jest.fn().mockReturnValue(execResolved(location)),
      find: jest.fn().mockReturnValue(execResolved([location])),
    };
    departmentModel = {
      findOne: jest.fn().mockReturnValue(
        execResolved({
          _id: { toString: () => departmentId },
          tenantId,
          name: 'Service',
        }),
      ),
      find: jest.fn().mockReturnValue(
        execResolved([
          {
            _id: { toString: () => departmentId },
            tenantId,
            name: 'Service',
          },
        ]),
      ),
    };
    userModel = {
      findById: jest.fn().mockReturnValue(execResolved(employee)),
      find: jest.fn().mockReturnValue(execResolved([employee])),
    };
    assignmentModel = {
      findOne: jest.fn().mockReturnValue(
        execResolved({
          tenantId,
          userId: employeeId,
          locationId,
          role: 'WAITER',
        }),
      ),
    };
    shiftModel = {
      findById: jest.fn().mockReturnValue(
        execResolved({
          _id: shiftId,
          tenantId,
          locationId,
          assignedUserIds: [employeeId],
        }),
      ),
      find: jest.fn().mockReturnValue(execResolved([])),
    };
    absenceModel = {
      findOne: jest.fn().mockReturnValue(execResolved(null)),
      find: jest.fn().mockReturnValue(execResolved([])),
    };
    accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(false),
      isCompanyAdmin: jest.fn().mockReturnValue(false),
      isManagementRole: jest.fn().mockReturnValue(false),
      isScopedLocationManager: jest.fn().mockReturnValue(false),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      assertCanManageLocation: jest.fn().mockResolvedValue(undefined),
      canManageUser: jest.fn().mockResolvedValue(true),
      getScopedResourceFilter: jest.fn().mockResolvedValue({ locationId }),
      getManageableLocationIds: jest.fn().mockResolvedValue([locationId]),
    };

    service = new TimeTrackingService(
      timeEntryModel,
      timeEntryBreakModel,
      correctionModel,
      auditLogModel,
      locationModel,
      departmentModel,
      userModel,
      assignmentModel,
      shiftModel,
      absenceModel,
      accessPolicy as any,
    );
  });

  it('creates a tenant-scoped open entry when the employee is assigned to the location', async () => {
    timeEntryModel.findOne.mockReturnValue(execResolved(null));

    const result = await service.clockIn({ locationId, shiftId, notes: 'Start' }, actor);

    expect(shiftModel.findById).toHaveBeenCalledWith(shiftId);
    expect(timeEntryModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        locationId,
        employeeId,
        shiftId,
        status: TimeEntryStatus.Open,
        notes: 'Start',
      }),
    );
    expect(result.status).toBe(TimeEntryStatus.Open);
  });

  it('blocks clock-in during approved vacation or sickness', async () => {
    timeEntryModel.findOne.mockReturnValue(execResolved(null));
    absenceModel.findOne.mockReturnValue(execResolved({ _id: 'absence-id' }));

    await expect(service.clockIn({ locationId }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a second open entry for the same employee', async () => {
    timeEntryModel.findOne.mockReturnValue(execResolved({ _id: 'open-entry' }));

    await expect(service.clockIn({ locationId }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('closes the own open entry and calculates duration minutes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T10:30:00.000Z'));
    const entry = {
      _id: { toString: () => 'entry-id' },
      employeeId,
      locationId,
      tenantId,
      clockIn: new Date('2026-06-06T08:00:00.000Z'),
      breakMinutes: 30,
      save: jest.fn().mockImplementation(function save(this: any) {
        return Promise.resolve(this);
      }),
    };
    timeEntryModel.findById.mockReturnValue(execResolved(entry));

    const result = await service.clockOut('6a2200000000000000000005', actor, {
      notes: 'Ende',
    });

    expect(result.status).toBe(TimeEntryStatus.Closed);
    expect(result.durationMinutes).toBe(150);
    expect(result.netDurationMinutes).toBe(120);
    expect(result.notes).toBe('Ende');
    jest.useRealTimers();
  });

  it('starts and ends a break for the own open entry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-06T12:30:00.000Z'));
    const entry = {
      _id: { toString: () => '6a2200000000000000000005' },
      employeeId,
      locationId,
      tenantId,
      status: TimeEntryStatus.Open,
      clockIn: new Date('2026-06-06T08:00:00.000Z'),
      breakMinutes: 0,
      save: jest.fn().mockImplementation(function save(this: any) {
        return Promise.resolve(this);
      }),
    };
    const openBreak = {
      _id: { toString: () => 'break-id' },
      tenantId,
      timeEntryId: entry._id.toString(),
      breakStartAt: new Date('2026-06-06T12:00:00.000Z'),
      durationMinutes: 0,
      save: jest.fn().mockImplementation(function save(this: any) {
        return Promise.resolve(this);
      }),
    };
    timeEntryModel.findById.mockReturnValue(execResolved(entry));
    timeEntryBreakModel.findOne
      .mockReturnValueOnce(execResolved(null))
      .mockReturnValueOnce(execResolved(openBreak));
    timeEntryBreakModel.find.mockReturnValue(
      execAndSortedResolved([{ durationMinutes: 30 }]),
    );

    const started = await service.startBreak(entry._id.toString(), actor, {
      notes: 'Mittag',
    });
    const ended = await service.endBreak(entry._id.toString(), actor);

    expect(started.notes).toBe('Mittag');
    expect(ended.durationMinutes).toBe(30);
    expect(entry.breakMinutes).toBe(30);
    jest.useRealTimers();
  });

  it('prevents clock-out while a break is still open', async () => {
    const entry = {
      _id: { toString: () => 'entry-id' },
      employeeId,
      locationId,
      tenantId,
      clockIn: new Date('2026-06-06T08:00:00.000Z'),
      breakMinutes: 0,
      save: jest.fn(),
    };
    timeEntryModel.findById.mockReturnValue(execResolved(entry));
    timeEntryBreakModel.findOne.mockReturnValue(execResolved({ _id: 'break-id' }));

    await expect(
      service.clockOut('6a2200000000000000000005', actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('corrects a closed entry with reason and audit log', async () => {
    accessPolicy.isCompanyAdmin.mockReturnValue(true);
    const entry = {
      _id: { toString: () => '6a2200000000000000000005' },
      employeeId,
      locationId,
      tenantId,
      status: TimeEntryStatus.Closed,
      clockIn: new Date('2026-06-06T08:00:00.000Z'),
      clockOut: new Date('2026-06-06T16:00:00.000Z'),
      breakMinutes: 30,
      save: jest.fn().mockImplementation(function save(this: any) {
        return Promise.resolve(this);
      }),
    };
    timeEntryModel.findById.mockReturnValue(execResolved(entry));

    const result = await service.correctTimeEntry(
      entry._id.toString(),
      { ...actor, roles: ['TENANT_ADMIN'] },
      {
        clockInAt: '2026-06-06T08:15:00.000Z',
        clockOutAt: '2026-06-06T16:00:00.000Z',
        breakMinutes: 45,
        correctionReason: 'Nachtrag laut Dienstplan',
      },
    );

    expect(result.status).toBe(TimeEntryStatus.Corrected);
    expect(result.correctedByUserId).toBe(employeeId);
    expect(result.durationMinutes).toBe(465);
    expect(result.netDurationMinutes).toBe(420);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'time_entry_corrected',
        entityType: 'time_entry',
        tenantId,
      }),
    );
  });

  it('prevents platform admins from using time tracking', async () => {
    accessPolicy.isPlatformAdmin.mockReturnValue(true);

    await expect(service.clockIn({ locationId }, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('scopes location managers to their manageable locations', async () => {
    accessPolicy.isManagementRole.mockReturnValue(false);
    accessPolicy.isScopedLocationManager.mockReturnValue(true);
    timeEntryModel.find.mockReturnValue(sortedExecResolved([]));

    await service.findAll({ ...actor, roles: ['LOCATION_MANAGER'] }, {});

    expect(timeEntryModel.find).toHaveBeenCalledWith({
      tenantId,
      locationId: { $in: [locationId] },
    });
  });

  it('summarizes planned, actual, break and approved absence minutes', async () => {
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({});
    shiftModel.find.mockReturnValue(
      execResolved([
        {
          tenantId,
          locationId,
          assignedUserIds: [employeeId],
          status: 'published',
          startTime: new Date('2026-06-08T08:00:00.000Z'),
          endTime: new Date('2026-06-08T16:00:00.000Z'),
        },
      ]),
    );
    timeEntryModel.find.mockReturnValue(
      execResolved([
        {
          tenantId,
          locationId,
          employeeId,
          status: TimeEntryStatus.Closed,
          clockIn: new Date('2026-06-08T08:00:00.000Z'),
          clockOut: new Date('2026-06-08T16:00:00.000Z'),
          durationMinutes: 480,
          breakMinutes: 30,
          netDurationMinutes: 450,
        },
      ]),
    );
    absenceModel.find.mockReturnValue(
      execResolved([
        {
          tenantId,
          locationId,
          employeeId,
          userId: employeeId,
          type: 'vacation',
          status: 'approved',
          startDate: new Date('2026-06-08T00:00:00.000Z'),
          endDate: new Date('2026-06-08T23:59:59.999Z'),
        },
      ]),
    );

    const report = await service.getWorktimeReport(
      { ...actor, roles: ['TENANT_ADMIN'] },
      {
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        groupBy: 'employee',
      },
    );

    expect(report.summary).toEqual(
      expect.objectContaining({
        plannedMinutes: 480,
        grossMinutes: 480,
        breakMinutes: 30,
        netMinutes: 450,
        vacationMinutes: 480,
        varianceMinutes: -30,
      }),
    );
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        employeeId,
        locationId,
        plannedMinutes: 480,
      }),
    );
  });

  it('filters the worktime report by department using departmentIds', async () => {
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({});
    const departmentEmployee = {
      ...employee,
      firstName: 'Max',
      lastName: 'Service',
      departmentIds: [departmentId],
    };
    userModel.find
      .mockReturnValueOnce(execResolved([departmentEmployee]))
      .mockReturnValueOnce(execResolved([departmentEmployee]));
    shiftModel.find.mockReturnValue(execResolved([]));
    timeEntryModel.find.mockReturnValue(execResolved([]));
    absenceModel.find.mockReturnValue(execResolved([]));

    const report = await service.getWorktimeReport(
      { ...actor, roles: ['TENANT_ADMIN'] },
      {
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        departmentId,
        groupBy: 'employee',
      },
    );

    expect(departmentModel.findOne).toHaveBeenCalledWith({
      _id: departmentId,
      tenantId,
    });
    expect(shiftModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedUserIds: { $in: [employeeId] },
      }),
    );
    expect(timeEntryModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: { $in: [employeeId] },
      }),
    );
    expect(report.items).toEqual([]);
  });

  it('groups the worktime report by department', async () => {
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({});
    userModel.find.mockReturnValue(
      execResolved([
        {
          ...employee,
          firstName: 'Max',
          lastName: 'Service',
          departmentIds: [departmentId],
        },
      ]),
    );
    shiftModel.find.mockReturnValue(
      execResolved([
        {
          tenantId,
          locationId,
          assignedUserIds: [employeeId],
          status: 'published',
          startTime: new Date('2026-06-08T08:00:00.000Z'),
          endTime: new Date('2026-06-08T16:00:00.000Z'),
        },
      ]),
    );
    timeEntryModel.find.mockReturnValue(
      execResolved([
        {
          tenantId,
          locationId,
          employeeId,
          status: TimeEntryStatus.Closed,
          clockIn: new Date('2026-06-08T08:00:00.000Z'),
          clockOut: new Date('2026-06-08T16:00:00.000Z'),
          durationMinutes: 480,
          breakMinutes: 30,
          netDurationMinutes: 450,
        },
      ]),
    );
    absenceModel.find.mockReturnValue(execResolved([]));

    const report = await service.getWorktimeReport(
      { ...actor, roles: ['TENANT_ADMIN'] },
      {
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        groupBy: 'department',
      },
    );

    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        departmentId,
        departmentName: 'Service',
        employeeCount: 1,
        plannedMinutes: 480,
        grossMinutes: 480,
        breakMinutes: 30,
        netMinutes: 450,
        varianceMinutes: -30,
      }),
    );
  });

  it('blocks cross-tenant department filters', async () => {
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({});
    departmentModel.findOne.mockReturnValue(execResolved(null));

    await expect(
      service.getWorktimeReport(
        { ...actor, roles: ['TENANT_ADMIN'] },
        {
          dateFrom: '2026-06-01',
          dateTo: '2026-06-30',
          departmentId,
          groupBy: 'department',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
