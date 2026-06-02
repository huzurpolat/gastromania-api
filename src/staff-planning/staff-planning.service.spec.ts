import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { Location } from '../locations/schemas/location.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/schemas/user.schema';
import { ShiftSwapRequest } from './schemas/shift-swap-request.schema';
import {
  StaffAbsence,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from './schemas/staff-absence.schema';
import { StaffAvailability } from './schemas/staff-availability.schema';
import { StaffNotification } from './schemas/staff-notification.schema';
import { StaffPlanningAudit } from './schemas/staff-planning-audit.schema';
import { StaffShift, StaffShiftStatus } from './schemas/staff-shift.schema';
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
    companyId: 'company-1',
    locationIds: [locationId],
    managedLocationIds: [locationId],
  };
  const employee = {
    _id: { toString: () => userId },
    isActive: true,
    email: 'service@test.local',
    roles: [Role.Service],
    companyId: 'company-1',
    locationIds: [locationId],
    departmentIds: [],
  };
  const location = {
    _id: { toString: () => locationId },
    companyId: 'company-1',
    regionId: 'region-nrw',
  };
  const shiftModel = {
    create: jest.fn(),
    exists: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
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
  const auditModel = { create: jest.fn() };
  const notificationModel = { create: jest.fn() };
  const userModel = {
    findById: jest.fn(),
    find: jest.fn(),
  };
  const locationModel = { findById: jest.fn() };
  const accessPolicy = {
    isPlatformAdmin: jest.fn(),
    isManagementRole: jest.fn(),
    assertCanManageLocation: jest.fn(),
    assertCanAccessLocation: jest.fn(),
    canAssignDepartment: jest.fn(),
    assertCanManageUser: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    getReadableLocationIds: jest.fn(),
    getManageableUsersFilter: jest.fn(),
  };
  const realtimeService = { publish: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    accessPolicy.isPlatformAdmin.mockReturnValue(false);
    accessPolicy.isManagementRole.mockReturnValue(true);
    accessPolicy.assertCanManageLocation.mockResolvedValue(undefined);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.canAssignDepartment.mockResolvedValue(true);
    accessPolicy.assertCanManageUser.mockResolvedValue(undefined);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({ locationId });
    accessPolicy.getReadableLocationIds.mockResolvedValue([locationId]);
    accessPolicy.getManageableUsersFilter.mockResolvedValue({
      locationIds: locationId,
    });
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });
    userModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(employee),
    });
    userModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([employee]),
      }),
    });
    shiftModel.exists.mockResolvedValue(null);
    absenceModel.exists.mockResolvedValue(null);
    shiftModel.create.mockImplementation(
      async (payload: Record<string, unknown>) => ({
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
      async (payload: Record<string, unknown>) => payload,
    );
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
        {
          provide: getModelToken(StaffPlanningAudit.name),
          useValue: auditModel,
        },
        {
          provide: getModelToken(StaffNotification.name),
          useValue: notificationModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Location.name), useValue: locationModel },
        { provide: AccessPolicyService, useValue: accessPolicy },
        { provide: RealtimeService, useValue: realtimeService },
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

  it('creates an absence request for vacation and notifies managers', async () => {
    absenceModel.create.mockImplementation(
      async (payload: Record<string, unknown>) => ({
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

    expect(absence.status).toBe(StaffAbsenceStatus.Requested);
    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: Role.Filialleiter,
        type: 'staff.absence.requested',
      }),
    );
  });
});
