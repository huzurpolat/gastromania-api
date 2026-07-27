import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { Department } from '../departments/schemas/department.schema';
import { Location } from '../locations/schemas/location.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { ForecastService } from '../reports/forecast.service';
import { TimeEntry } from '../time-tracking/schemas/time-entry.schema';
import { UserLocationAssignment } from '../users/schemas/user-location-assignment.schema';
import { User } from '../users/schemas/user.schema';
import { ShiftSwapRequest } from './schemas/shift-swap-request.schema';
import { ShiftSuggestion } from './schemas/shift-suggestion.schema';
import { StaffingPlanSuggestion } from './schemas/staffing-plan-suggestion.schema';
import {
  StaffAbsence,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from './schemas/staff-absence.schema';
import { StaffAvailability } from './schemas/staff-availability.schema';
import { StaffNotification } from './schemas/staff-notification.schema';
import { StaffPlanningAudit } from './schemas/staff-planning-audit.schema';
import { StaffSchedulePublication } from './schemas/staff-schedule-publication.schema';
import { StaffWorkingTimeSettings } from './schemas/staff-working-time-settings.schema';
import { StaffShift, StaffShiftStatus } from './schemas/staff-shift.schema';
import { ShiftTemplate } from './schemas/shift-template.schema';
import { StaffPlanningService } from './staff-planning.service';

describe('StaffPlanningService', () => {
  let service: StaffPlanningService;
  const locationId = '507f1f77bcf86cd799439012';
  const userId = '507f1f77bcf86cd799439013';
  const shiftId = '507f1f77bcf86cd799439014';
  const actor = {
    sub: '507f1f77bcf86cd799439099',
    email: 'filialleiter@test.local',
    roles: [Role.Filialleiter],
    tenantId: 'tenant-1',
    companyId: 'company-1',
    locationIds: [locationId],
    managedLocationIds: [locationId],
  };
  const employee = {
    _id: { toString: () => userId },
    isActive: true,
    email: 'service@test.local',
    roles: [Role.Service],
    tenantId: 'tenant-1',
    companyId: 'company-1',
    locationIds: [locationId],
    departmentIds: [],
  };
  const location = {
    _id: { toString: () => locationId },
    tenantId: 'tenant-1',
    companyId: 'company-1',
    regionId: 'region-nrw',
  };
  const shiftModel = {
    create: jest.fn(),
    exists: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    updateMany: jest.fn(),
  };
  const publicationModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const availabilityModel = {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
  };
  const absenceModel = {
    create: jest.fn(),
    exists: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
  };
  const swapModel = {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
  };
  const suggestionModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const staffingPlanModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const auditModel = { create: jest.fn() };
  const notificationModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };
  const templateModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
  const userModel = {
    findById: jest.fn(),
    find: jest.fn(),
  };
  const assignmentModel = {
    findOne: jest.fn(),
  };
  const locationModel = { findById: jest.fn(), find: jest.fn() };
  const departmentModel = { find: jest.fn() };
  const timeEntryModel = { find: jest.fn() };
  const workingTimeSettingsModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const accessPolicy = {
    isPlatformAdmin: jest.fn(),
    isScopedLocationManager: jest.fn(),
    isManagementRole: jest.fn(),
    assertCanManageLocation: jest.fn(),
    assertCanAccessLocation: jest.fn(),
    canAssignDepartment: jest.fn(),
    assertCanManageUser: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    getReadableLocationIds: jest.fn(),
    getManageableLocationIds: jest.fn(),
    getManageableUsersFilter: jest.fn(),
  };
  const realtimeService = { publish: jest.fn() };
  const forecastService = { getForecast: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    accessPolicy.isPlatformAdmin.mockReturnValue(false);
    accessPolicy.isScopedLocationManager.mockReturnValue(false);
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.assertCanManageLocation.mockResolvedValue(undefined);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.canAssignDepartment.mockResolvedValue(true);
    accessPolicy.assertCanManageUser.mockResolvedValue(undefined);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({ locationId });
    accessPolicy.getReadableLocationIds.mockResolvedValue([locationId]);
    accessPolicy.getManageableLocationIds.mockResolvedValue([locationId]);
    accessPolicy.getManageableUsersFilter.mockResolvedValue({
      locationIds: locationId,
    });
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });
    locationModel.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: { toString: () => locationId },
            name: 'Frittenwerk Demo Duesseldorf',
          },
        ]),
      }),
    });
    departmentModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: { toString: () => 'dept-service' },
            name: 'Service',
          },
        ]),
      }),
    });
    userModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(employee),
    });
    userModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([employee]),
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([employee]),
      }),
    });
    assignmentModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          role: Role.Waiter,
        }),
      }),
    });
    shiftModel.exists.mockResolvedValue(null);
    shiftModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    shiftModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    suggestionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    suggestionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    suggestionModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    suggestionModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    suggestionModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => '507f1f77bcf86cd799439040' },
        ...payload,
      }),
    );
    staffingPlanModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    staffingPlanModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    staffingPlanModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    staffingPlanModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    staffingPlanModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => '507f1f77bcf86cd799439041' },
        ...payload,
      }),
    );
    timeEntryModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    workingTimeSettingsModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    workingTimeSettingsModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        maxDailyHours: 10,
        maxWeeklyHours: 48,
        maxMonthlyHours: 192,
        overtimeWarningThresholdHours: 5,
        varianceWarningThresholdHours: 2,
      }),
    });
    shiftModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    });
    publicationModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    publicationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'publication-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        locationId,
        week: 24,
        year: 2026,
        status: 'PUBLISHED',
        changedAfterPublish: false,
        toObject: () => ({
          _id: 'publication-1',
          locationId,
          week: 24,
          year: 2026,
          status: 'PUBLISHED',
        }),
      }),
    });
    absenceModel.exists.mockResolvedValue(null);
    shiftModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => shiftId },
        ...payload,
        toObject: () => ({ _id: shiftId, ...payload }),
      }),
    );
    shiftModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => shiftId },
        companyId: 'company-1',
        locationId,
        roleNeeded: Role.Service,
        title: 'Service Frueh',
        startTime: new Date('2026-06-08T08:00:00Z'),
        endTime: new Date('2026-06-08T14:00:00Z'),
        status: StaffShiftStatus.Draft,
        requiredStaffCount: 2,
        assignedUserIds: [userId],
        save: jest.fn().mockImplementation(function save(this: unknown) {
          return Promise.resolve(this);
        }),
        toObject: () => ({
          _id: shiftId,
          locationId,
          assignedUserIds: [userId],
        }),
      }),
    });
    notificationModel.create.mockImplementation(
      (payload: Record<string, unknown>) => Promise.resolve(payload),
    );
    notificationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    notificationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439016',
        tenantId: 'tenant-1',
        recipientUserId: actor.sub,
        type: 'SCHEDULE_PUBLISHED',
        title: 'Dienstplan veroeffentlicht',
        message: 'Dein Dienstplan wurde veroeffentlicht.',
        read: true,
        readAt: new Date(),
      }),
    });
    notificationModel.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    });
    forecastService.getForecast.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      formula: 'test',
      period: { mode: 'week', week: 24, year: 2026, dateFrom: '2026-06-08', dateTo: '2026-06-15' },
      forecastRevenue: 0,
      forecastHours: 0,
      plannedHours: 0,
      varianceHours: 0,
      expectedLaborCost: 0,
      confidence: 'LOW',
      staffingWarnings: [],
      locations: [],
      departments: [],
    });
    auditModel.create.mockResolvedValue({});
    realtimeService.publish.mockReturnValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffPlanningService,
        { provide: getModelToken(StaffShift.name), useValue: shiftModel },
        {
          provide: getModelToken(StaffAvailability.name),
          useValue: availabilityModel,
        },
        { provide: getModelToken(StaffAbsence.name), useValue: absenceModel },
        { provide: getModelToken(ShiftSwapRequest.name), useValue: swapModel },
        { provide: getModelToken(ShiftSuggestion.name), useValue: suggestionModel },
        { provide: getModelToken(StaffingPlanSuggestion.name), useValue: staffingPlanModel },
        { provide: getModelToken(ShiftTemplate.name), useValue: templateModel },
        {
          provide: getModelToken(StaffPlanningAudit.name),
          useValue: auditModel,
        },
        {
          provide: getModelToken(StaffSchedulePublication.name),
          useValue: publicationModel,
        },
        {
          provide: getModelToken(StaffNotification.name),
          useValue: notificationModel,
        },
        {
          provide: getModelToken(StaffWorkingTimeSettings.name),
          useValue: workingTimeSettingsModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(UserLocationAssignment.name),
          useValue: assignmentModel,
        },
        { provide: getModelToken(Location.name), useValue: locationModel },
        { provide: getModelToken(Department.name), useValue: departmentModel },
        { provide: getModelToken(TimeEntry.name), useValue: timeEntryModel },
        { provide: AccessPolicyService, useValue: accessPolicy },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: ForecastService, useValue: forecastService },
      ],
    }).compile();

    service = moduleRef.get(StaffPlanningService);
  });

  it('lets a branch manager create a shift with assigned staff', async () => {
    const shift = await service.createShift(
      {
        locationId,
        roleNeeded: Role.Service,
        title: 'Service Frueh',
        startTime: '2026-06-08T08:00:00.000Z',
        endTime: '2026-06-08T14:00:00.000Z',
        requiredStaffCount: 2,
        assignedUserIds: [userId],
      },
      actor,
    );

    expect(shift).toEqual(expect.objectContaining({ title: 'Service Frueh' }));
    expect(shiftModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        regionId: 'region-nrw',
        assignedUserIds: [userId],
        createdBy: actor.sub,
      }),
    );
    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.shift.created' }),
    );
  });

  it('prevents double booking an employee', async () => {
    shiftModel.exists.mockResolvedValueOnce({ _id: 'conflict' });

    await expect(
      service.createShift(
        {
          locationId,
          roleNeeded: Role.Service,
          title: 'Service Frueh',
          startTime: '2026-06-08T08:00:00.000Z',
          endTime: '2026-06-08T14:00:00.000Z',
          requiredStaffCount: 1,
          assignedUserIds: [userId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an employee location assignment before planning a shift', async () => {
    assignmentModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      service.createShift(
        {
          locationId,
          roleNeeded: Role.Service,
          title: 'Service Frueh',
          startTime: '2026-06-08T08:00:00.000Z',
          endTime: '2026-06-08T14:00:00.000Z',
          requiredStaffCount: 1,
          assignedUserIds: [userId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the employee location role to match the shift role', async () => {
    assignmentModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          role: Role.Kitchen,
        }),
      }),
    });

    await expect(
      service.createShift(
        {
          locationId,
          roleNeeded: Role.Service,
          title: 'Service Frueh',
          startTime: '2026-06-08T08:00:00.000Z',
          endTime: '2026-06-08T14:00:00.000Z',
          requiredStaffCount: 1,
          assignedUserIds: [userId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows assignment when the employee has the required leading department', async () => {
    const departmentId = 'dept-service';
    userModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        ...employee,
        departmentId,
        departmentIds: [],
      }),
    });

    await service.createShift(
      {
        locationId,
        departmentId,
        roleNeeded: Role.Service,
        title: 'Service Frueh',
        startTime: '2026-06-08T08:00:00.000Z',
        endTime: '2026-06-08T14:00:00.000Z',
        requiredStaffCount: 1,
        assignedUserIds: [userId],
      },
      actor,
    );

    expect(shiftModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId }),
    );
  });

  it('rejects assignment when the employee belongs to another department', async () => {
    userModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        ...employee,
        departmentId: 'dept-kitchen',
        departmentIds: [],
      }),
    });

    await expect(
      service.createShift(
        {
          locationId,
          departmentId: 'dept-service',
          roleNeeded: Role.Service,
          title: 'Service Frueh',
          startTime: '2026-06-08T08:00:00.000Z',
          endTime: '2026-06-08T14:00:00.000Z',
          requiredStaffCount: 1,
          assignedUserIds: [userId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters shifts by shift department and employees in that department', async () => {
    const departmentId = 'dept-service';

    await service.findShifts(actor, {
      locationId,
      departmentId,
      start: '2026-06-08T00:00:00.000Z',
      end: '2026-06-15T00:00:00.000Z',
    });

    expect(userModel.find).toHaveBeenCalledWith({
      $and: [
        { locationIds: locationId },
        {
          $or: [{ departmentId }, { departmentIds: departmentId }],
        },
      ],
    });
    expect(shiftModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: [
          { locationId },
          {
            $or: [
              { departmentId },
              { assignedUserIds: { $in: [userId] } },
            ],
          },
        ],
        startTime: {
          $gte: new Date('2026-06-08T00:00:00.000Z'),
          $lt: new Date('2026-06-15T00:00:00.000Z'),
        },
      }),
    );
  });

  it('blocks assignment during approved vacation or sickness', async () => {
    absenceModel.exists.mockResolvedValueOnce({ _id: 'absence' });

    await expect(
      service.createShift(
        {
          locationId,
          roleNeeded: Role.Service,
          title: 'Service Frueh',
          startTime: '2026-06-08T08:00:00.000Z',
          endTime: '2026-06-08T14:00:00.000Z',
          requiredStaffCount: 1,
          assignedUserIds: [userId],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes a shift and creates notifications for assigned users', async () => {
    const shift = await service.publishShift(shiftId, actor);

    expect(shift.status).toBe(StaffShiftStatus.Published);
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        type: 'staff.shift.published',
      }),
    );
    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.shift.published' }),
    );
  });

  it('publishes a location week and marks shifts as published', async () => {
    shiftModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => shiftId },
          locationId,
          companyId: 'company-1',
          assignedUserIds: [userId],
        },
      ]),
    });

    const publication = await service.publishSchedule(
      { locationId, week: 24, year: 2026 },
      actor,
    );

    expect(publication).toEqual(expect.objectContaining({ status: 'PUBLISHED' }));
    expect(publicationModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ locationId, week: 24, year: 2026 }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'PUBLISHED',
          changedAfterPublish: false,
        }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(shiftModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ locationId }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: StaffShiftStatus.Published }),
      }),
    );
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        recipientUserId: userId,
        type: 'SCHEDULE_PUBLISHED',
        title: 'Dienstplan veröffentlicht',
      }),
    );
  });

  it('returns only own notifications for tenant users', async () => {
    const ownNotifications = [
      {
        _id: '507f1f77bcf86cd799439016',
        tenantId: 'tenant-1',
        recipientUserId: actor.sub,
        type: 'SCHEDULE_PUBLISHED',
        read: false,
      },
    ];
    const exec = jest.fn().mockResolvedValue(ownNotifications);
    const limit = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ limit });
    notificationModel.find.mockReturnValueOnce({ sort });

    await expect(service.findNotifications(actor)).resolves.toBe(ownNotifications);
    expect(notificationModel.find).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      $or: [{ recipientUserId: actor.sub }, { userId: actor.sub }],
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(30);
  });

  it('marks only own notifications as read', async () => {
    const notificationId = '507f1f77bcf86cd799439016';

    await service.markNotificationRead(notificationId, actor);

    expect(notificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: notificationId,
        tenantId: 'tenant-1',
        $or: [{ recipientUserId: actor.sub }, { userId: actor.sub }],
      },
      { $set: { read: true, readAt: expect.any(Date) } },
      { returnDocument: 'after' },
    );
  });

  it('returns the current user schedule with only published own shifts', async () => {
    const publishedShift = {
      _id: { toString: () => shiftId },
      tenantId: 'tenant-1',
      companyId: 'company-1',
      locationId,
      departmentId: 'dept-service',
      roleNeeded: Role.Service,
      title: 'Service Frueh',
      startTime: new Date('2026-06-08T08:00:00.000Z'),
      endTime: new Date('2026-06-08T14:00:00.000Z'),
      status: StaffShiftStatus.Published,
      assignedUserIds: [actor.sub],
    };
    shiftModel.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([publishedShift]),
      }),
    });
    absenceModel.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    availabilityModel.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    const schedule = await service.findMySchedule(actor, {
      week: 24,
      year: 2026,
    });

    expect(schedule.shifts).toEqual([publishedShift]);
    expect(shiftModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        assignedUserIds: actor.sub,
        status: StaffShiftStatus.Published,
        startTime: {
          $gte: expect.any(Date),
          $lt: expect.any(Date),
        },
      }),
    );
    expect(schedule.locations).toEqual([
      { _id: locationId, name: 'Frittenwerk Demo Duesseldorf' },
    ]);
    expect(schedule.departments).toEqual([
      { _id: 'dept-service', name: 'Service' },
    ]);
  });

  it('calculates target, actual and overtime hours from contract and time entries', async () => {
    const contractedEmployee = {
      ...employee,
      firstName: 'Max',
      lastName: 'Service',
      weeklyHours: 40,
      employmentType: 'FULL_TIME',
      hireDate: new Date('2026-01-01T00:00:00.000Z'),
    };
    userModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: { toString: () => userId } }]),
        }),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue([contractedEmployee]),
      });
    timeEntryModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        {
          employeeId: userId,
          clockIn: new Date('2026-06-08T08:00:00.000Z'),
          netDurationMinutes: 45 * 60,
          status: 'closed',
        },
      ]),
    });
    shiftModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([]),
    });

    const result = await service.findWorkingTimeAccount(actor, {
      week: 24,
      year: 2026,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        employeeId: userId,
        employeeName: 'Max Service',
        contractHoursPerWeek: 40,
        targetHours: 40,
        actualHours: 45,
        overtimeHours: 5,
        balanceHours: 5,
      }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        targetHours: 40,
        actualHours: 45,
        overtimeHours: 5,
        balanceHours: 5,
      }),
    );
  });

  it('calculates plan actual variance from published shifts by employee location and department', async () => {
    const contractedEmployee = {
      ...employee,
      firstName: 'Max',
      lastName: 'Service',
      weeklyHours: 40,
      departmentIds: ['dept-service'],
    };
    userModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: { toString: () => userId } }]),
        }),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue([contractedEmployee]),
      });
    timeEntryModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        {
          employeeId: userId,
          locationId,
          clockIn: new Date('2026-06-08T08:00:00.000Z'),
          netDurationMinutes: 8 * 60,
          status: 'closed',
        },
      ]),
    });
    shiftModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        {
          locationId,
          departmentId: 'dept-service',
          startTime: new Date('2026-06-08T08:00:00.000Z'),
          endTime: new Date('2026-06-08T14:00:00.000Z'),
          status: StaffShiftStatus.Published,
          assignedUserIds: [userId],
        },
      ]),
    });

    const result = await service.findWorkingTimeAccount(actor, {
      week: 24,
      year: 2026,
    });

    expect(shiftModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $ne: StaffShiftStatus.Cancelled },
        $or: [
          { status: StaffShiftStatus.Published },
          { publishedAt: { $exists: true } },
        ],
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        plannedHours: 6,
        actualHours: 8,
        varianceHours: 2,
      }),
    );
    expect(result.locationAnalysis).toEqual([
      expect.objectContaining({
        id: locationId,
        name: 'Frittenwerk Demo Duesseldorf',
        employeeCount: 1,
        plannedHours: 6,
        actualHours: 8,
        varianceHours: 2,
      }),
    ]);
    expect(result.departmentAnalysis).toEqual([
      expect.objectContaining({
        id: 'dept-service',
        name: 'Service',
        employeeCount: 1,
        plannedHours: 6,
        actualHours: 8,
        varianceHours: 2,
      }),
    ]);
  });

  it('adds working time warnings when thresholds are exceeded', async () => {
    const contractedEmployee = {
      ...employee,
      firstName: 'Anna',
      lastName: 'Kueche',
      weeklyHours: 40,
    };
    userModel.find
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: { toString: () => userId } }]),
        }),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue([contractedEmployee]),
      });
    workingTimeSettingsModel.findOne.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        maxDailyHours: 10,
        maxWeeklyHours: 48,
        maxMonthlyHours: 192,
        overtimeWarningThresholdHours: 5,
        varianceWarningThresholdHours: 2,
      }),
    });
    timeEntryModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([
        {
          employeeId: userId,
          clockIn: new Date('2026-06-08T08:00:00.000Z'),
          netDurationMinutes: 11 * 60,
          status: 'closed',
        },
        {
          employeeId: userId,
          clockIn: new Date('2026-06-09T08:00:00.000Z'),
          netDurationMinutes: 34 * 60,
          status: 'closed',
        },
      ]),
    });
    shiftModel.find.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue([]),
    });

    const result = await service.findWorkingTimeAccount(actor, {
      week: 24,
      year: 2026,
    });

    expect(result.items[0].warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'DAILY_LIMIT_EXCEEDED' }),
        expect.objectContaining({ type: 'OVERTIME_THRESHOLD_EXCEEDED' }),
      ]),
    );
    expect(result.summary.warningCount).toBeGreaterThanOrEqual(2);
  });

  it('creates an absence request for vacation and notifies managers', async () => {
    absenceModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => 'absence-1' },
        ...payload,
        toObject: () => ({ _id: 'absence-1', ...payload }),
      }),
    );

    const absence = await service.createAbsence(
      {
        userId,
        type: StaffAbsenceType.Vacation,
        startDate: '2026-06-10T00:00:00.000Z',
        endDate: '2026-06-12T00:00:00.000Z',
        reason: 'Urlaub',
      },
      actor,
    );

    expect(absence.status).toBe(StaffAbsenceStatus.Pending);
    expect(absenceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        employeeId: userId,
        requestedByUserId: actor.sub,
      }),
    );
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: Role.Filialleiter,
        type: 'staff.absence.requested',
      }),
    );
  });

  it('marks approved absences with a shift conflict warning', async () => {
    const absence = {
      _id: { toString: () => '507f1f77bcf86cd799439015' },
      userId,
      employeeId: userId,
      locationId,
      companyId: 'company-1',
      tenantId: 'tenant-1',
      type: StaffAbsenceType.Vacation,
      status: StaffAbsenceStatus.Pending,
      startDate: new Date('2026-06-10T00:00:00.000Z'),
      endDate: new Date('2026-06-12T23:59:59.999Z'),
      save: jest.fn().mockImplementation(function save(this: unknown) {
        return Promise.resolve(this);
      }),
      toObject: () => ({
        userId,
        employeeId: userId,
        locationId,
        status: StaffAbsenceStatus.Pending,
      }),
    };
    absenceModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(absence),
    });
    shiftModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(2),
    });

    const approved = await service.approveAbsence(
      '507f1f77bcf86cd799439015',
      actor,
      { managerNote: 'Genehmigt, Schichten umbuchen' },
    );

    expect(approved.status).toBe(StaffAbsenceStatus.Approved);
    expect(approved.hasShiftConflicts).toBe(true);
    expect(approved.shiftConflictCount).toBe(2);
    expect(approved.managerNote).toBe('Genehmigt, Schichten umbuchen');
  });
});
