import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import {
  StaffAbsence,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftStatus,
} from '../staff-planning/schemas/staff-shift.schema';
import { TimeEntry } from '../time-tracking/schemas/time-entry.schema';
import { User } from '../users/schemas/user.schema';
import { PayrollService } from './payroll.service';
import {
  PayrollPeriod,
  PayrollPeriodStatus,
} from './schemas/payroll-period.schema';

describe('PayrollService', () => {
  let service: PayrollService;
  const employeeId = '507f1f77bcf86cd799439011';
  const actor = {
    sub: '507f1f77bcf86cd799439099',
    email: 'filialleiter@test.local',
    roles: [Role.Filialleiter],
    tenantId: 'company-1',
    companyId: 'company-1',
    locationIds: ['loc-1'],
    managedLocationIds: ['loc-1'],
  };
  const employee = {
    _id: { toString: () => employeeId },
    email: 'service@test.local',
    firstName: 'Sina',
    lastName: 'Service',
    roles: [Role.Service],
    role: Role.Service,
    isActive: true,
    employeeNumber: 'GM-1',
    contractType: 'Teilzeit',
    hourlyRate: 15,
    monthlySalary: 0,
  };
  const userModel = { find: jest.fn() };
  const timeEntryModel = { find: jest.fn() };
  const staffShiftModel = { find: jest.fn() };
  const absenceModel = { find: jest.fn() };
  const payrollPeriod = {
    _id: { toString: () => 'period-1' },
    tenantId: 'company-1',
    locationId: 'loc-1',
    employeeId: null,
    start: new Date('2026-06-04T00:00:00.000Z'),
    end: new Date('2026-06-06T00:00:00.000Z'),
    status: PayrollPeriodStatus.Open,
    lockedAt: undefined as Date | undefined,
    lockedByUserId: undefined as string | undefined,
    employeeSnapshots: [],
    totalsSnapshot: {},
    save: jest.fn().mockResolvedValue(undefined),
  };
  const payrollPeriodModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const accessPolicy = {
    getManageableUsersFilter: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    isPlatformAdmin: jest.fn(),
    assertCanAccessLocation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    accessPolicy.getManageableUsersFilter.mockResolvedValue({
      locationIds: 'loc-1',
    });
    accessPolicy.getScopedResourceFilter.mockResolvedValue({
      locationId: 'loc-1',
    });
    accessPolicy.isPlatformAdmin.mockReturnValue(false);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    userModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([employee]),
      }),
    });
    timeEntryModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          employeeId,
          locationId: 'loc-1',
          clockIn: new Date('2026-06-04T08:00:00.000Z'),
          clockOut: new Date('2026-06-04T16:30:00.000Z'),
          breakMinutes: 30,
        },
      ]),
    });
    staffShiftModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          assignedUserIds: [employeeId],
          locationId: 'loc-1',
          status: StaffShiftStatus.Published,
          startTime: new Date('2026-06-04T08:00:00.000Z'),
          endTime: new Date('2026-06-04T16:00:00.000Z'),
        },
      ]),
    });
    absenceModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          userId: employeeId,
          status: StaffAbsenceStatus.Approved,
          type: StaffAbsenceType.Vacation,
          startDate: new Date('2026-06-05T00:00:00.000Z'),
          endDate: new Date('2026-06-05T00:00:00.000Z'),
        },
      ]),
    });
    payrollPeriod.status = PayrollPeriodStatus.Open;
    payrollPeriod.employeeSnapshots = [];
    payrollPeriod.totalsSnapshot = {};
    payrollPeriod.lockedAt = undefined;
    payrollPeriod.lockedByUserId = undefined;
    payrollPeriod.save = jest.fn().mockResolvedValue(payrollPeriod);
    payrollPeriodModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(payrollPeriod),
    });
    payrollPeriodModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([payrollPeriod]),
      }),
    });
    payrollPeriodModel.create.mockResolvedValue(payrollPeriod);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(TimeEntry.name), useValue: timeEntryModel },
        { provide: getModelToken(StaffShift.name), useValue: staffShiftModel },
        { provide: getModelToken(StaffAbsence.name), useValue: absenceModel },
        {
          provide: getModelToken(PayrollPeriod.name),
          useValue: payrollPeriodModel,
        },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = moduleRef.get(PayrollService);
  });

  it('calculates time account and labor cost for scoped employees', async () => {
    const result = await service.summary(actor, {
      locationId: 'loc-1',
      start: '2026-06-04T00:00:00.000Z',
      end: '2026-06-06T00:00:00.000Z',
    });

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toEqual(
      expect.objectContaining({
        plannedHours: 8,
        actualHours: 8,
        breakHours: 0.5,
        overtimeHours: 0,
        vacationDays: 1,
        laborCost: 120,
        grossPay: 120,
      }),
    );
    expect(result.period.status).toBe(PayrollPeriodStatus.Open);
    expect(result.totals).toEqual(
      expect.objectContaining({
        actualHours: 8,
        plannedHours: 8,
        laborCost: 120,
        grossPay: 120,
      }),
    );
  });

  it('locks a payroll period with calculated gross payroll snapshot', async () => {
    const result = await service.lockPeriod(actor, {
      locationId: 'loc-1',
      start: '2026-06-04T00:00:00.000Z',
      end: '2026-06-06T00:00:00.000Z',
    });

    expect(result.period.status).toBe(PayrollPeriodStatus.Locked);
    expect(payrollPeriod.status).toBe(PayrollPeriodStatus.Locked);
    expect(payrollPeriod.employeeSnapshots).toHaveLength(1);
    expect(payrollPeriod.totalsSnapshot).toEqual(
      expect.objectContaining({ grossPay: 120 }),
    );
    expect(payrollPeriod.save).toHaveBeenCalled();
  });

  it('returns locked snapshot instead of recalculating period totals', async () => {
    payrollPeriod.status = PayrollPeriodStatus.Locked;
    payrollPeriod.lockedAt = new Date('2026-06-07T09:00:00.000Z');
    payrollPeriod.employeeSnapshots = [
      {
        employee: { _id: employeeId, name: 'Sina Service' },
        plannedHours: 1,
        actualHours: 2,
        breakHours: 0,
        overtimeHours: 1,
        absenceDays: 0,
        sickDays: 0,
        vacationDays: 0,
        hourlyRate: 20,
        grossPay: 40,
        laborCost: 40,
        minijobWarning: false,
      },
    ];
    payrollPeriod.totalsSnapshot = {
      plannedHours: 1,
      actualHours: 2,
      breakHours: 0,
      overtimeHours: 1,
      grossPay: 40,
      laborCost: 40,
      vacationDays: 0,
      sickDays: 0,
    };

    const result = await service.summary(actor, {
      locationId: 'loc-1',
      start: '2026-06-04T00:00:00.000Z',
      end: '2026-06-06T00:00:00.000Z',
    });

    expect(result.period.status).toBe(PayrollPeriodStatus.Locked);
    expect(result.totals.grossPay).toBe(40);
    expect(userModel.find).not.toHaveBeenCalled();
  });

  it('exports payroll as semicolon separated CSV', async () => {
    const exported = await service.export(actor, {
      locationId: 'loc-1',
      start: '2026-06-04T00:00:00.000Z',
      end: '2026-06-06T00:00:00.000Z',
      format: 'csv',
    });

    expect(exported.filename).toContain('gastromania-payroll');
    expect(exported.content).toContain('"Sina Service"');
    expect(exported.content).toContain('"120"');
    expect(exported.content).toContain('"Bruttolohn"');
  });
});
