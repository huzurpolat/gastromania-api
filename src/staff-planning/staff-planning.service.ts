import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { hasAnyRole } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { RealtimeService } from '../realtime/realtime.service';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AbsenceFiltersDto,
  CreateAbsenceDto,
  ReviewAbsenceDto,
} from './dto/absence.dto';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { CreateShiftSwapRequestDto } from './dto/shift-swap.dto';
import {
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
} from './dto/shift-template.dto';
import {
  AssignStaffShiftDto,
  CreateStaffShiftDto,
  UnassignStaffShiftDto,
  UpdateStaffShiftDto,
} from './dto/staff-shift.dto';
import {
  ShiftSwapRequest,
  ShiftSwapRequestDocument,
  ShiftSwapStatus,
} from './schemas/shift-swap-request.schema';
import {
  ShiftTemplate,
  ShiftTemplateDocument,
} from './schemas/shift-template.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
  StaffAbsenceStatus,
} from './schemas/staff-absence.schema';
import {
  StaffAvailability,
  StaffAvailabilityDocument,
} from './schemas/staff-availability.schema';
import {
  StaffNotification,
  StaffNotificationDocument,
} from './schemas/staff-notification.schema';
import {
  StaffPlanningAudit,
  StaffPlanningAuditDocument,
} from './schemas/staff-planning-audit.schema';
import {
  StaffShift,
  StaffShiftDocument,
  StaffShiftStatus,
} from './schemas/staff-shift.schema';

export interface StaffShiftFilters {
  locationId?: string;
  departmentId?: string;
  roleNeeded?: string;
  status?: StaffShiftStatus;
  start?: string;
  end?: string;
  mine?: boolean;
}

@Injectable()
export class StaffPlanningService {
  constructor(
    @InjectModel(StaffShift.name)
    private readonly shiftModel: Model<StaffShiftDocument>,
    @InjectModel(StaffAvailability.name)
    private readonly availabilityModel: Model<StaffAvailabilityDocument>,
    @InjectModel(StaffAbsence.name)
    private readonly absenceModel: Model<StaffAbsenceDocument>,
    @InjectModel(ShiftSwapRequest.name)
    private readonly swapModel: Model<ShiftSwapRequestDocument>,
    @InjectModel(ShiftTemplate.name)
    private readonly templateModel: Model<ShiftTemplateDocument>,
    @InjectModel(StaffPlanningAudit.name)
    private readonly auditModel: Model<StaffPlanningAuditDocument>,
    @InjectModel(StaffNotification.name)
    private readonly notificationModel: Model<StaffNotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly assignmentModel: Model<UserLocationAssignmentDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    private readonly accessPolicy: AccessPolicyService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async findShifts(actor: AuthenticatedUser, filters: StaffShiftFilters = {}) {
    const query = await this.getShiftQuery(actor, filters);
    return this.shiftModel.find(query).sort({ startTime: 1 }).exec();
  }

  async findTemplates(
    actor: AuthenticatedUser,
    filters: { locationId?: string } = {},
  ) {
    const query: Record<string, unknown> = {
      $or: [{ locationId: { $exists: false } }],
    };

    if (filters.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        filters.locationId,
      );
      query.$or = [
        { locationId: filters.locationId },
        { locationId: { $exists: false } },
      ];
    } else {
      const locationIds = await this.accessPolicy.getReadableLocationIds(actor);
      query.$or = [
        { locationId: { $in: locationIds } },
        { locationId: { $exists: false } },
      ];
    }

    return this.templateModel.find(query).sort({ name: 1 }).exec();
  }

  async createTemplate(
    payload: CreateShiftTemplateDto,
    actor: AuthenticatedUser,
  ) {
    if (payload.locationId) {
      await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    } else if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Schichtvorlagen');
    }
    this.assertTimeWindow(payload.startTime, payload.endTime);

    const template = await this.templateModel.create({
      ...payload,
      companyId: actor.companyId,
      breakMinutes: payload.breakMinutes ?? 0,
      requiredStaffCount: payload.requiredStaffCount ?? 1,
      isActive: payload.isActive ?? true,
    });

    await this.writeAudit(actor, 'staff.shiftTemplate.created', {
      locationId: template.locationId,
      newValue: this.snapshot(template),
    });

    return template;
  }

  async updateTemplate(
    id: string,
    payload: UpdateShiftTemplateDto,
    actor: AuthenticatedUser,
  ) {
    const template = await this.getTemplateOrThrow(id);
    if (template.locationId) {
      await this.assertCanManageStaffAtLocation(actor, template.locationId);
    } else if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Schichtvorlagen');
    }
    if (payload.locationId) {
      await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    }
    if (payload.startTime && payload.endTime) {
      this.assertTimeWindow(payload.startTime, payload.endTime);
    }
    const previousValue = this.snapshot(template);
    const updated = await this.templateModel
      .findByIdAndUpdate(id, payload, { returnDocument: 'after', runValidators: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Schichtvorlage nicht gefunden');
    }
    await this.writeAudit(actor, 'staff.shiftTemplate.updated', {
      locationId: updated.locationId,
      previousValue,
      newValue: this.snapshot(updated),
    });
    return updated;
  }

  async deleteTemplate(id: string, actor: AuthenticatedUser) {
    const template = await this.getTemplateOrThrow(id);
    if (template.locationId) {
      await this.assertCanManageStaffAtLocation(actor, template.locationId);
    } else if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Schichtvorlagen');
    }
    await this.templateModel.findByIdAndDelete(id).exec();
    await this.writeAudit(actor, 'staff.shiftTemplate.deleted', {
      locationId: template.locationId,
      previousValue: this.snapshot(template),
    });
  }

  async findShift(id: string, actor: AuthenticatedUser) {
    const shift = await this.getShiftOrThrow(id);

    if (!(await this.canReadShift(actor, shift))) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    return shift;
  }

  async createShift(payload: CreateStaffShiftDto, actor: AuthenticatedUser) {
    await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    await this.validateDepartment(actor, payload.departmentId);
    this.assertValidDateRange(payload.startTime, payload.endTime);
    const location = await this.getLocationOrThrow(payload.locationId);
    const assignedUserIds = payload.assignedUserIds ?? [];

    for (const userId of assignedUserIds) {
      await this.assertUserCanBeAssigned({
        actor,
        userId,
        locationId: payload.locationId,
        departmentId: payload.departmentId,
        roleNeeded: payload.roleNeeded,
        startTime: new Date(payload.startTime),
        endTime: new Date(payload.endTime),
      });
    }

    const shift = await this.shiftModel.create({
      ...payload,
      tenantId: location.tenantId ?? actor.tenantId,
      companyId: payload.companyId ?? location.companyId ?? actor.companyId,
      regionId: payload.regionId ?? location.regionId,
      startTime: new Date(payload.startTime),
      endTime: new Date(payload.endTime),
      status: StaffShiftStatus.Draft,
      assignedUserIds,
      createdBy: actor.sub,
    });

    await this.writeAudit(actor, 'staff.shift.created', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      newValue: this.snapshot(shift),
    });

    return shift;
  }

  async updateShift(
    id: string,
    payload: UpdateStaffShiftDto,
    actor: AuthenticatedUser,
  ) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);

    if (
      shift.status === StaffShiftStatus.Published &&
      !this.canChangePublishedShifts(actor)
    ) {
      throw new ForbiddenException(
        'Veroeffentlichte Schichten duerfen nicht geaendert werden',
      );
    }

    const nextLocationId = payload.locationId ?? shift.locationId;
    await this.assertCanManageStaffAtLocation(actor, nextLocationId);
    const nextLocation = await this.getLocationOrThrow(nextLocationId);
    await this.validateDepartment(
      actor,
      payload.departmentId ?? shift.departmentId,
    );

    const startTime = new Date(payload.startTime ?? shift.startTime);
    const endTime = new Date(payload.endTime ?? shift.endTime);
    this.assertValidDateRange(startTime, endTime);

    const assignedUserIds =
      payload.assignedUserIds ?? shift.assignedUserIds ?? [];
    for (const userId of assignedUserIds) {
      await this.assertUserCanBeAssigned({
        actor,
        userId,
        locationId: nextLocationId,
        departmentId: payload.departmentId ?? shift.departmentId,
        roleNeeded: payload.roleNeeded ?? shift.roleNeeded,
        startTime,
        endTime,
        ignoreShiftId: shift._id.toString(),
      });
    }

    const previousValue = this.snapshot(shift);
    const updated = await this.shiftModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          tenantId: nextLocation.tenantId ?? actor.tenantId,
          companyId: payload.companyId ?? nextLocation.companyId ?? shift.companyId,
          regionId: payload.regionId ?? nextLocation.regionId ?? shift.regionId,
          startTime,
          endTime,
          assignedUserIds,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    await this.writeAudit(actor, 'staff.shift.updated', {
      locationId: updated.locationId,
      shiftId: updated._id.toString(),
      previousValue,
      newValue: this.snapshot(updated),
    });
    await this.notifyAssignedUsers(
      updated,
      'staff.shift.changed',
      'Eine Schicht wurde geaendert.',
    );

    return updated;
  }

  async assignShift(
    id: string,
    payload: AssignStaffShiftDto,
    actor: AuthenticatedUser,
  ) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    const assignedUserIds = [
      ...new Set([...(shift.assignedUserIds ?? []), ...payload.userIds]),
    ];

    for (const userId of payload.userIds) {
      await this.assertUserCanBeAssigned({
        actor,
        userId,
        locationId: shift.locationId,
        departmentId: shift.departmentId,
        roleNeeded: shift.roleNeeded,
        startTime: shift.startTime,
        endTime: shift.endTime,
        ignoreShiftId: shift._id.toString(),
      });
    }

    const previousValue = this.snapshot(shift);
    shift.assignedUserIds = assignedUserIds;
    const saved = await shift.save();

    await this.writeAudit(actor, 'staff.shift.assigned', {
      locationId: saved.locationId,
      shiftId: saved._id.toString(),
      previousValue,
      newValue: { assignedUserIds },
    });
    await Promise.all(
      payload.userIds.map((userId) =>
        this.notify({
          companyId: saved.companyId,
          locationId: saved.locationId,
          userId,
          type: 'staff.shift.assigned',
          message: `Du wurdest der Schicht "${saved.title}" zugewiesen.`,
          payload: { shiftId: saved._id.toString() },
        }),
      ),
    );

    return saved;
  }

  async unassignShift(
    id: string,
    payload: UnassignStaffShiftDto,
    actor: AuthenticatedUser,
  ) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    const previousValue = this.snapshot(shift);
    shift.assignedUserIds = (shift.assignedUserIds ?? []).filter(
      (userId) => !payload.userIds.includes(userId),
    );
    const saved = await shift.save();

    await this.writeAudit(actor, 'staff.shift.unassigned', {
      locationId: saved.locationId,
      shiftId: saved._id.toString(),
      previousValue,
      newValue: { assignedUserIds: saved.assignedUserIds },
    });

    return saved;
  }

  async publishShift(id: string, actor: AuthenticatedUser) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    shift.status = StaffShiftStatus.Published;
    shift.publishedAt = new Date();
    shift.publishedBy = actor.sub;
    const saved = await shift.save();

    await this.writeAudit(actor, 'staff.shift.published', {
      locationId: saved.locationId,
      shiftId: saved._id.toString(),
      newValue: this.snapshot(saved),
    });
    await this.notifyAssignedUsers(
      saved,
      'staff.shift.published',
      'Der Dienstplan wurde veroeffentlicht.',
    );
    await this.notifyUnderstaffing(saved);

    return saved;
  }

  async completeShift(id: string, actor: AuthenticatedUser) {
    return this.setShiftStatus(
      id,
      StaffShiftStatus.Completed,
      actor,
      'staff.shift.completed',
    );
  }

  async cancelShift(id: string, actor: AuthenticatedUser) {
    const saved = await this.setShiftStatus(
      id,
      StaffShiftStatus.Cancelled,
      actor,
      'staff.shift.cancelled',
    );
    await this.notifyAssignedUsers(
      saved,
      'staff.shift.cancelled',
      'Eine Schicht wurde storniert.',
    );
    return saved;
  }

  async deleteShift(id: string, actor: AuthenticatedUser) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    const previousValue = this.snapshot(shift);
    await this.shiftModel.findByIdAndDelete(id).exec();
    await this.writeAudit(actor, 'staff.shift.deleted', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      previousValue,
    });
  }

  async findAvailability(
    actor: AuthenticatedUser,
    filters: { locationId?: string; userId?: string } = {},
  ) {
    const query: Record<string, unknown> = {};

    if (this.isStaffManager(actor)) {
      if (filters.locationId) {
        await this.accessPolicy.assertCanAccessLocation(
          actor,
          filters.locationId,
        );
        query.locationId = filters.locationId;
      } else {
        const locationIds =
          await this.accessPolicy.getReadableLocationIds(actor);
        query.$or = [
          { locationId: { $in: locationIds } },
          { locationId: { $exists: false } },
        ];
      }
      if (filters.userId) {
        query.userId = filters.userId;
      }
    } else {
      query.userId = actor.sub;
    }

    return this.availabilityModel
      .find(query)
      .sort({ date: 1, weekday: 1 })
      .exec();
  }

  async createAvailability(
    payload: CreateAvailabilityDto,
    actor: AuthenticatedUser,
  ) {
    const userId = payload.userId ?? actor.sub;
    await this.assertCanWriteOwnOrManage(actor, userId);
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        payload.locationId,
      );
    }
    this.assertTimeWindow(payload.availableFrom, payload.availableTo);

    const availability = await this.availabilityModel.create({
      ...payload,
      userId,
      companyId: actor.companyId,
      date: payload.date ? new Date(payload.date) : undefined,
    });
    await this.writeAudit(actor, 'staff.availability.created', {
      locationId: availability.locationId,
      newValue: this.snapshot(availability),
    });

    return availability;
  }

  async updateAvailability(
    id: string,
    payload: UpdateAvailabilityDto,
    actor: AuthenticatedUser,
  ) {
    const availability = await this.getAvailabilityOrThrow(id);
    await this.assertCanWriteOwnOrManage(actor, availability.userId);
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        payload.locationId,
      );
    }
    if (payload.availableFrom && payload.availableTo) {
      this.assertTimeWindow(payload.availableFrom, payload.availableTo);
    }

    const previousValue = this.snapshot(availability);
    const updated = await this.availabilityModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          date: payload.date ? new Date(payload.date) : availability.date,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Verfuegbarkeit nicht gefunden');
    await this.writeAudit(actor, 'staff.availability.updated', {
      locationId: updated.locationId,
      previousValue,
      newValue: this.snapshot(updated),
    });
    return updated;
  }

  async deleteAvailability(id: string, actor: AuthenticatedUser) {
    const availability = await this.getAvailabilityOrThrow(id);
    await this.assertCanWriteOwnOrManage(actor, availability.userId);
    await this.availabilityModel.findByIdAndDelete(id).exec();
    await this.writeAudit(actor, 'staff.availability.deleted', {
      locationId: availability.locationId,
      previousValue: this.snapshot(availability),
    });
  }

  async findAbsences(actor: AuthenticatedUser, filters: AbsenceFiltersDto = {}) {
    const query = await this.getAbsenceQuery(actor, filters);
    return this.absenceModel.find(query).sort({ startDate: -1 }).exec();
  }

  async findAbsence(id: string, actor: AuthenticatedUser) {
    const absence = await this.getAbsenceOrThrow(id);
    const user = await this.getUserOrThrow(this.getAbsenceUserId(absence));

    if (!(await this.canReadAbsence(actor, absence, user))) {
      throw new NotFoundException('Abwesenheit nicht gefunden');
    }

    return absence;
  }

  async createAbsence(payload: CreateAbsenceDto, actor: AuthenticatedUser) {
    this.assertTenantUser(actor);
    const userId = payload.employeeId ?? payload.userId ?? actor.sub;
    await this.assertCanWriteOwnOrManage(actor, userId);
    const { startDate, endDate } = this.parseAbsenceRange(payload);
    const user = await this.getUserOrThrow(userId);
    const locationId = payload.locationId ?? this.getPrimaryUserLocationId(user);
    if (locationId) {
      await this.assertAbsenceLocation(actor, user, locationId);
    }
    const absence = await this.absenceModel.create({
      ...payload,
      userId,
      employeeId: userId,
      requestedByUserId: actor.sub,
      tenantId: user.tenantId ?? actor.tenantId,
      locationId,
      companyId: user.companyId ?? actor.companyId,
      startDate,
      endDate,
      status: StaffAbsenceStatus.Pending,
      hasShiftConflicts: false,
      shiftConflictCount: 0,
    });

    await this.writeAudit(actor, 'absence_requested', {
      locationId: absence.locationId,
      newValue: this.snapshot(absence),
    });
    await this.notifyManagersForUser(
      user,
      'staff.absence.requested',
      'Eine Abwesenheit wurde beantragt.',
    );

    return absence;
  }

  approveAbsence(
    id: string,
    actor: AuthenticatedUser,
    payload: ReviewAbsenceDto = {},
  ) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Approved,
      actor,
      'absence_approved',
      payload,
    );
  }

  rejectAbsence(
    id: string,
    actor: AuthenticatedUser,
    payload: ReviewAbsenceDto = {},
  ) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Rejected,
      actor,
      'absence_rejected',
      payload,
    );
  }

  cancelAbsence(id: string, actor: AuthenticatedUser) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Cancelled,
      actor,
      'absence_cancelled',
    );
  }

  async findShiftSwaps(actor: AuthenticatedUser) {
    if (this.isStaffManager(actor)) {
      const shifts = await this.findShifts(actor);
      return this.swapModel
        .find({ shiftId: { $in: shifts.map((shift) => shift._id.toString()) } })
        .sort({ createdAt: -1 })
        .exec();
    }

    return this.swapModel
      .find({ $or: [{ requestedBy: actor.sub }, { targetUserId: actor.sub }] })
      .sort({ createdAt: -1 })
      .exec();
  }

  async createShiftSwap(
    payload: CreateShiftSwapRequestDto,
    actor: AuthenticatedUser,
  ) {
    const shift = await this.findShift(payload.shiftId, actor);
    if (!shift.assignedUserIds.includes(actor.sub)) {
      throw new ForbiddenException(
        'Nur zugewiesene Mitarbeiter koennen Schichttausch anfragen',
      );
    }
    if (payload.targetUserId) {
      await this.assertUserCanBeAssigned({
        actor,
        userId: payload.targetUserId,
        locationId: shift.locationId,
        departmentId: shift.departmentId,
        roleNeeded: shift.roleNeeded,
        startTime: shift.startTime,
        endTime: shift.endTime,
        ignoreShiftId: shift._id.toString(),
      });
    }

    const swap = await this.swapModel.create({
      companyId: shift.companyId ?? actor.companyId,
      shiftId: shift._id.toString(),
      requestedBy: actor.sub,
      targetUserId: payload.targetUserId,
      status: ShiftSwapStatus.Requested,
      note: payload.note,
    });

    await this.writeAudit(actor, 'staff.shiftSwap.requested', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      newValue: this.snapshot(swap),
    });
    await this.notifyManagersForShift(
      shift,
      'staff.shiftSwap.requested',
      'Ein Schichttausch wurde angefragt.',
    );

    return swap;
  }

  acceptShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.setSwapStatus(id, ShiftSwapStatus.Accepted, actor, false);
  }

  approveShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.setSwapStatus(id, ShiftSwapStatus.Approved, actor, true);
  }

  rejectShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.setSwapStatus(id, ShiftSwapStatus.Rejected, actor, true);
  }

  private async setShiftStatus(
    id: string,
    status: StaffShiftStatus,
    actor: AuthenticatedUser,
    action: string,
  ) {
    const shift = await this.getShiftOrThrow(id);
    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    const previousValue = this.snapshot(shift);
    shift.status = status;
    const saved = await shift.save();
    await this.writeAudit(actor, action, {
      locationId: saved.locationId,
      shiftId: saved._id.toString(),
      previousValue,
      newValue: this.snapshot(saved),
    });
    return saved;
  }

  private async setAbsenceStatus(
    id: string,
    status: StaffAbsenceStatus,
    actor: AuthenticatedUser,
    action: string,
    payload: ReviewAbsenceDto = {},
  ) {
    this.assertTenantUser(actor);
    const absence = await this.getAbsenceOrThrow(id);
    const user = await this.getUserOrThrow(this.getAbsenceUserId(absence));
    const isOwnCancellation =
      status === StaffAbsenceStatus.Cancelled &&
      this.getAbsenceUserId(absence) === actor.sub &&
      this.isPendingAbsence(absence.status);

    if (isOwnCancellation) {
      // Eigene offene Antraege duerfen Mitarbeiter selbst zurueckziehen.
    } else {
      await this.assertCanManageAbsence(actor, absence, user);
    }

    if (
      [StaffAbsenceStatus.Approved, StaffAbsenceStatus.Rejected].includes(
        status,
      ) &&
      !this.isPendingAbsence(absence.status)
    ) {
      throw new BadRequestException(
        'Nur offene Abwesenheitsantraege koennen entschieden werden',
      );
    }

    const previousValue = this.snapshot(absence);
    absence.status = status;
    absence.managerNote = payload.managerNote ?? absence.managerNote;
    if (
      [StaffAbsenceStatus.Approved, StaffAbsenceStatus.Rejected].includes(
        status,
      )
    ) {
      absence.approvedBy = actor.sub;
      absence.approvedAt = new Date();
      absence.reviewedByUserId = actor.sub;
      absence.reviewedAt = absence.approvedAt;
    }
    if (status === StaffAbsenceStatus.Approved) {
      const conflictCount = await this.countShiftConflicts(absence);
      absence.shiftConflictCount = conflictCount;
      absence.hasShiftConflicts = conflictCount > 0;
    }
    const saved = await absence.save();
    await this.writeAudit(actor, action, {
      locationId: saved.locationId,
      previousValue,
      newValue: this.snapshot(saved),
    });
    await this.notify({
      companyId: saved.companyId,
      userId: saved.userId,
      type: action,
      message: `Deine Abwesenheit wurde ${status}.`,
      payload: { absenceId: saved._id.toString() },
    });
    return saved;
  }

  private async getAbsenceQuery(
    actor: AuthenticatedUser,
    filters: AbsenceFiltersDto,
  ): Promise<Record<string, unknown>> {
    this.assertTenantUser(actor);
    const query: Record<string, unknown> = {
      $and: [
        {
          $or: [
            { tenantId: actor.tenantId },
            ...(actor.companyId
              ? [{ tenantId: { $exists: false }, companyId: actor.companyId }]
              : []),
          ],
        },
      ],
    };
    const andFilters = query.$and as Record<string, unknown>[];
    const employeeId = filters.employeeId ?? filters.userId;

    if (this.isStaffManager(actor)) {
      if (employeeId) {
        const user = await this.getUserOrThrow(employeeId);
        await this.assertCanManageUserForStaff(actor, user);
        andFilters.push(this.userMatch(employeeId));
      } else {
        const manageable = await this.getManageableUserIds(actor);
        andFilters.push({
          $or: [{ userId: { $in: manageable } }, { employeeId: { $in: manageable } }],
        });
      }
      if (filters.locationId) {
        await this.accessPolicy.assertCanAccessLocation(
          actor,
          filters.locationId,
        );
        andFilters.push({ locationId: filters.locationId });
      } else if (this.accessPolicy.isScopedLocationManager(actor)) {
        andFilters.push({
          locationId: {
            $in: await this.accessPolicy.getManageableLocationIds(actor),
          },
        });
      }
    } else {
      andFilters.push(this.userMatch(actor.sub));
      if (filters.locationId) {
        await this.accessPolicy.assertCanAccessLocation(
          actor,
          filters.locationId,
        );
        andFilters.push({ locationId: filters.locationId });
      }
    }

    if (filters.type) andFilters.push({ type: filters.type });
    if (filters.status) {
      andFilters.push(this.statusMatch(filters.status));
    }
    if (filters.dateFrom || filters.dateTo) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
      const to = filters.dateTo ? new Date(filters.dateTo) : undefined;
      if (
        (from && Number.isNaN(from.getTime())) ||
        (to && Number.isNaN(to.getTime()))
      ) {
        throw new BadRequestException('Ungueltiger Zeitraum');
      }
      andFilters.push({
        ...(to ? { startDate: { $lte: to } } : {}),
        ...(from ? { endDate: { $gte: from } } : {}),
      });
    }

    return query;
  }

  private async canReadAbsence(
    actor: AuthenticatedUser,
    absence: StaffAbsenceDocument,
    user: UserDocument,
  ): Promise<boolean> {
    if (this.getAbsenceUserId(absence) === actor.sub) {
      return true;
    }
    try {
      await this.assertCanManageAbsence(actor, absence, user);
      return true;
    } catch {
      return false;
    }
  }

  private async assertCanManageAbsence(
    actor: AuthenticatedUser,
    absence: StaffAbsenceDocument,
    user: UserDocument,
  ) {
    await this.assertCanManageUserForStaff(actor, user);
    if (absence.locationId) {
      await this.accessPolicy.assertCanManageLocation(actor, absence.locationId);
    }
  }

  private async assertAbsenceLocation(
    actor: AuthenticatedUser,
    user: UserDocument,
    locationId: string,
  ) {
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    const location = await this.getLocationOrThrow(locationId);
    const tenantId = location.tenantId ?? actor.tenantId ?? user.tenantId;
    if (tenantId && user.tenantId && user.tenantId !== tenantId) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum Tenant des Standorts',
      );
    }
    const legacyLocationIds = this.getUserLocationIds(user);
    const assignment = await this.assignmentModel
      .findOne({
        ...(tenantId ? { tenantId } : {}),
        userId: user._id.toString(),
        locationId,
      })
      .select('_id')
      .exec();

    if (!legacyLocationIds.includes(locationId) && !assignment) {
      throw new BadRequestException(
        'Mitarbeiter ist diesem Standort nicht zugewiesen',
      );
    }
  }

  private parseAbsenceRange(payload: CreateAbsenceDto): {
    startDate: Date;
    endDate: Date;
  } {
    const startDate = this.dateWithOptionalTime(
      payload.startDate,
      payload.startTime,
      false,
    );
    const endDate = this.dateWithOptionalTime(payload.endDate, payload.endTime, true);

    if (startDate.getTime() >= endDate.getTime()) {
      throw new BadRequestException('Ende muss nach Beginn liegen');
    }
    if (payload.startTime && payload.endTime && payload.startTime >= payload.endTime) {
      const startDay = this.dateOnly(payload.startDate);
      const endDay = this.dateOnly(payload.endDate);
      if (startDay === endDay) {
        throw new BadRequestException('Endzeit muss nach Startzeit liegen');
      }
    }

    return { startDate, endDate };
  }

  private dateWithOptionalTime(value: string, time: string | undefined, endOfDay: boolean): Date {
    const day = this.dateOnly(value);
    const date = time
      ? new Date(`${day}T${time}:00`)
      : new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ungueltiger Zeitraum');
    }
    return date;
  }

  private dateOnly(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ungueltiger Zeitraum');
    }
    return value.includes('T') ? value.slice(0, 10) : value;
  }

  private async countShiftConflicts(absence: StaffAbsenceDocument): Promise<number> {
    return this.shiftModel
      .countDocuments({
        assignedUserIds: this.getAbsenceUserId(absence),
        status: { $nin: [StaffShiftStatus.Cancelled] },
        startTime: { $lt: absence.endDate },
        endTime: { $gt: absence.startDate },
      })
      .exec();
  }

  private statusMatch(status: StaffAbsenceStatus): Record<string, unknown> {
    if (
      status === StaffAbsenceStatus.Pending ||
      status === StaffAbsenceStatus.Requested
    ) {
      return {
        status: {
          $in: [StaffAbsenceStatus.Pending, StaffAbsenceStatus.Requested],
        },
      };
    }
    return { status };
  }

  private userMatch(userId: string): Record<string, unknown> {
    return { $or: [{ userId }, { employeeId: userId }] };
  }

  private isPendingAbsence(status: StaffAbsenceStatus): boolean {
    return [StaffAbsenceStatus.Pending, StaffAbsenceStatus.Requested].includes(
      status,
    );
  }

  private getAbsenceUserId(absence: StaffAbsenceDocument): string {
    return absence.employeeId ?? absence.userId;
  }

  private getPrimaryUserLocationId(
    user: Pick<UserDocument, 'locationId' | 'locationIds'>,
  ): string | undefined {
    return user.locationId ?? user.locationIds?.[0];
  }

  private async setSwapStatus(
    id: string,
    status: ShiftSwapStatus,
    actor: AuthenticatedUser,
    requireManager: boolean,
  ) {
    const swap = await this.getSwapOrThrow(id);
    const shift = await this.getShiftOrThrow(swap.shiftId);

    if (requireManager) {
      await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    } else if (swap.targetUserId !== actor.sub) {
      throw new ForbiddenException(
        'Nur Zielmitarbeiter koennen diese Anfrage annehmen',
      );
    }

    const previousValue = this.snapshot(swap);
    swap.status = status;
    const saved = await swap.save();

    if (status === ShiftSwapStatus.Approved && swap.targetUserId) {
      shift.assignedUserIds = [
        ...shift.assignedUserIds.filter(
          (userId) => userId !== swap.requestedBy,
        ),
        swap.targetUserId,
      ];
      await shift.save();
    }

    await this.writeAudit(actor, `staff.shiftSwap.${status}`, {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      previousValue,
      newValue: this.snapshot(saved),
    });
    await this.notify({
      companyId: saved.companyId,
      locationId: shift.locationId,
      userId: saved.requestedBy,
      type: `staff.shiftSwap.${status}`,
      message: `Deine Schichttausch-Anfrage ist ${status}.`,
      payload: { swapId: saved._id.toString(), shiftId: shift._id.toString() },
    });

    return saved;
  }

  private async getShiftQuery(
    actor: AuthenticatedUser,
    filters: StaffShiftFilters,
  ): Promise<Record<string, unknown>> {
    let query: Record<string, unknown>;

    if (this.accessPolicy.isScopedLocationManager(actor) && !filters.mine) {
      if (filters.locationId) {
        await this.accessPolicy.assertCanManageLocation(
          actor,
          filters.locationId,
        );
        query = { locationId: filters.locationId };
      } else {
        query = {
          locationId: {
            $in: await this.accessPolicy.getManageableLocationIds(actor),
          },
        };
      }
    } else {
      query = await this.accessPolicy.getScopedResourceFilter(
        actor,
        filters.locationId,
      );
    }

    if (!this.isStaffManager(actor) || filters.mine) {
      query.assignedUserIds = actor.sub;
    }
    if (filters.departmentId) {
      const departmentUserIds = await this.getManageableUserIds(
        actor,
        filters.departmentId,
      );
      const departmentQuery: Record<string, unknown> = {
        $or: [
          { departmentId: filters.departmentId },
          ...(departmentUserIds.length
            ? [{ assignedUserIds: { $in: departmentUserIds } }]
            : []),
        ],
      };
      query = { $and: [query, departmentQuery] };
    }
    if (filters.roleNeeded) query.roleNeeded = filters.roleNeeded;
    if (filters.status) query.status = filters.status;
    if (filters.start || filters.end) {
      query.startTime = {
        ...(filters.start ? { $gte: new Date(filters.start) } : {}),
        ...(filters.end ? { $lt: new Date(filters.end) } : {}),
      };
    }

    return query;
  }

  private async canReadShift(
    actor: AuthenticatedUser,
    shift: StaffShiftDocument,
  ) {
    return (
      (await this.accessPolicy.canAccessLocation(actor, shift.locationId)) &&
      (this.isStaffManager(actor) || shift.assignedUserIds.includes(actor.sub))
    );
  }

  private async assertUserCanBeAssigned(options: {
    actor: AuthenticatedUser;
    userId: string;
    locationId: string;
    departmentId?: string;
    roleNeeded: string;
    startTime: Date;
    endTime: Date;
    ignoreShiftId?: string;
  }) {
    const user = await this.getUserOrThrow(options.userId);
    const location = await this.getLocationOrThrow(options.locationId);
    const tenantId = location.tenantId ?? options.actor.tenantId ?? user.tenantId;
    if (tenantId && user.tenantId && user.tenantId !== tenantId) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum Tenant des Standorts',
      );
    }
    await this.assertCanManageUserForStaff(options.actor, user);
    const assignmentQuery: Record<string, unknown> = {
      userId: user._id.toString(),
      locationId: options.locationId,
    };
    if (tenantId) {
      assignmentQuery.tenantId = tenantId;
    }
    const assignment = await this.assignmentModel
      .findOne(assignmentQuery)
      .select('role')
      .exec();
    if (!assignment) {
      throw new BadRequestException(
        'Mitarbeiter ist diesem Standort nicht zugewiesen',
      );
    }
    const userDepartmentIds = this.getUserDepartmentIds(user);
    if (
      options.departmentId &&
      userDepartmentIds.length &&
      !userDepartmentIds.includes(options.departmentId)
    ) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum benoetigten Department',
      );
    }
    if (
      !this.roleMatches([assignment.role], options.roleNeeded)
    ) {
      throw new BadRequestException(
        'Mitarbeiter besitzt die benoetigte Standortrolle nicht',
      );
    }
    await this.assertNoOverlappingShift(
      options.userId,
      options.startTime,
      options.endTime,
      options.ignoreShiftId,
    );
    await this.assertNoApprovedAbsence(
      options.userId,
      options.startTime,
      options.endTime,
    );
  }

  private async assertNoOverlappingShift(
    userId: string,
    startTime: Date,
    endTime: Date,
    ignoreShiftId?: string,
  ) {
    const query: Record<string, unknown> = {
      assignedUserIds: userId,
      status: { $nin: [StaffShiftStatus.Cancelled] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };
    if (ignoreShiftId) {
      query._id = { $ne: ignoreShiftId };
    }

    const conflict = await this.shiftModel.exists(query);
    if (conflict) {
      throw new BadRequestException(
        'Mitarbeiter ist in diesem Zeitraum bereits eingeplant',
      );
    }
  }

  private async assertNoApprovedAbsence(
    userId: string,
    startTime: Date,
    endTime: Date,
  ) {
    const absence = await this.absenceModel.exists({
      userId,
      status: StaffAbsenceStatus.Approved,
      startDate: { $lt: endTime },
      endDate: { $gt: startTime },
    });
    if (absence) {
      throw new BadRequestException(
        'Mitarbeiter ist im genehmigten Urlaub oder krank',
      );
    }
  }

  private async assertCanManageStaffAtLocation(
    actor: AuthenticatedUser,
    locationId: string,
  ) {
    if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Dienstplanung');
    }
    await this.accessPolicy.assertCanManageLocation(actor, locationId);
  }

  private async assertCanWriteOwnOrManage(
    actor: AuthenticatedUser,
    userId: string,
  ) {
    if (actor.sub === userId) return;
    const user = await this.getUserOrThrow(userId);
    await this.assertCanManageUserForStaff(actor, user);
  }

  private async assertCanManageUserForStaff(
    actor: AuthenticatedUser,
    user: UserDocument,
  ) {
    if (!this.isStaffManager(actor)) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer Mitarbeiterplanung',
      );
    }
    await this.accessPolicy.assertCanManageUser(actor, user);
  }

  private assertTenantUser(actor: AuthenticatedUser): void {
    if (this.accessPolicy.isPlatformAdmin(actor) || !actor.tenantId) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }
  }

  private async validateDepartment(
    actor: AuthenticatedUser,
    departmentId?: string,
  ) {
    if (
      departmentId &&
      !(await this.accessPolicy.canAssignDepartment(actor, departmentId))
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer dieses Department');
    }
  }

  private async getManageableUserIds(
    actor: AuthenticatedUser,
    departmentId?: string,
  ): Promise<string[]> {
    const manageableFilter = await this.accessPolicy.getManageableUsersFilter(actor);
    const query = departmentId
      ? {
          $and: [
            manageableFilter,
            {
              $or: [
                { departmentId },
                { departmentIds: departmentId },
              ],
            },
          ],
        }
      : manageableFilter;
    const users = await this.userModel.find(query).select('_id').exec();
    return users.map((user) => user._id.toString());
  }

  private getUserDepartmentIds(user: {
    departmentId?: string;
    departmentIds?: string[];
  }): string[] {
    return [
      ...new Set(
        [user.departmentId, ...(user.departmentIds ?? [])].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
  }

  private async getLocationOrThrow(locationId: string) {
    this.validateObjectId(locationId, 'Standort-ID');
    const location = await this.locationModel.findById(locationId).exec();
    if (!location) throw new NotFoundException('Standort nicht gefunden');
    return location;
  }

  private async getUserOrThrow(userId: string) {
    this.validateObjectId(userId, 'Benutzer-ID');
    const user = await this.userModel.findById(userId).exec();
    if (!user || !user.isActive)
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    return user;
  }

  private async getShiftOrThrow(id: string) {
    this.validateObjectId(id, 'Schicht-ID');
    const shift = await this.shiftModel.findById(id).exec();
    if (!shift) throw new NotFoundException('Schicht nicht gefunden');
    return shift;
  }

  private async getAvailabilityOrThrow(id: string) {
    this.validateObjectId(id, 'Verfuegbarkeit-ID');
    const availability = await this.availabilityModel.findById(id).exec();
    if (!availability)
      throw new NotFoundException('Verfuegbarkeit nicht gefunden');
    return availability;
  }

  private async getAbsenceOrThrow(id: string) {
    this.validateObjectId(id, 'Abwesenheits-ID');
    const absence = await this.absenceModel.findById(id).exec();
    if (!absence) throw new NotFoundException('Abwesenheit nicht gefunden');
    return absence;
  }

  private async getSwapOrThrow(id: string) {
    this.validateObjectId(id, 'Schichttausch-ID');
    const swap = await this.swapModel.findById(id).exec();
    if (!swap) throw new NotFoundException('Schichttausch nicht gefunden');
    return swap;
  }

  private async getTemplateOrThrow(id: string) {
    this.validateObjectId(id, 'Schichtvorlagen-ID');
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Schichtvorlage nicht gefunden');
    return template;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    action: string,
    options: {
      locationId?: string;
      shiftId?: string;
      previousValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      note?: string;
    } = {},
  ) {
    await this.auditModel.create({
      userId: actor.sub,
      role: actor.roles?.[0],
      action,
      timestamp: new Date(),
      ...options,
    });
    this.realtimeService.publish('staff.audit.created', {
      action,
      actorId: actor.sub,
      ...options,
    });
  }

  private async notifyAssignedUsers(
    shift: StaffShiftDocument,
    type: string,
    message: string,
  ) {
    await Promise.all(
      (shift.assignedUserIds ?? []).map((userId) =>
        this.notify({
          companyId: shift.companyId,
          locationId: shift.locationId,
          userId,
          type,
          message,
          payload: { shiftId: shift._id.toString() },
        }),
      ),
    );
  }

  private async notifyUnderstaffing(shift: StaffShiftDocument) {
    if ((shift.assignedUserIds?.length ?? 0) >= shift.requiredStaffCount) {
      return;
    }
    await this.notifyManagersForShift(
      shift,
      'staff.understaffed',
      `Schicht "${shift.title}" ist unterbesetzt.`,
    );
  }

  private async notifyManagersForShift(
    shift: StaffShiftDocument,
    type: string,
    message: string,
  ) {
    await this.notify({
      companyId: shift.companyId,
      locationId: shift.locationId,
      targetRole: Role.Filialleiter,
      type,
      message,
      payload: { shiftId: shift._id.toString() },
    });
  }

  private async notifyManagersForUser(
    user: UserDocument,
    type: string,
    message: string,
  ) {
    for (const locationId of this.getUserLocationIds(user)) {
      await this.notify({
        companyId: user.companyId,
        locationId,
        targetRole: Role.Filialleiter,
        type,
        message,
        payload: { userId: user._id.toString() },
      });
    }
  }

  private async notify(payload: {
    companyId?: string;
    locationId?: string;
    userId?: string;
    targetRole?: string;
    type: string;
    message: string;
    payload: Record<string, unknown>;
  }) {
    const notification = await this.notificationModel.create(payload);
    this.realtimeService.publish('staff.notification.created', notification);
    return notification;
  }

  private isStaffManager(actor: AuthenticatedUser): boolean {
    return (
      this.accessPolicy.isScopedLocationManager(actor) ||
      this.accessPolicy.isManagementRole(actor) ||
      hasAnyRole(actor.roles, [Role.Schichtleiter, Role.Personalabteilung])
    );
  }

  private canChangePublishedShifts(actor: AuthenticatedUser): boolean {
    return !hasAnyRole(actor.roles, [Role.Schichtleiter]);
  }

  private roleMatches(userRoles: string[], roleNeeded: string): boolean {
    if (!roleNeeded) return true;
    const normalizedNeed = this.normalizeRole(roleNeeded);
    return userRoles.some(
      (role) => this.normalizeRole(role) === normalizedNeed,
    );
  }

  private getUserLocationIds(
    user: Pick<
      UserDocument,
      'locationId' | 'locationIds' | 'managedLocationIds'
    >,
  ): string[] {
    return [
      ...(user.locationIds ?? []),
      ...(user.managedLocationIds ?? []),
      ...(user.locationId ? [user.locationId] : []),
    ];
  }

  private assertValidDateRange(start: string | Date, end: string | Date) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime())
    ) {
      throw new BadRequestException('Ungueltiger Zeitraum');
    }
    if (startDate.getTime() >= endDate.getTime()) {
      throw new BadRequestException('Ende muss nach Beginn liegen');
    }
  }

  private assertTimeWindow(from: string, to: string) {
    if (from >= to) {
      throw new BadRequestException('Verfuegbarkeit endet vor ihrem Beginn');
    }
  }

  private snapshot(document: {
    toObject?: () => Record<string, unknown>;
  }): Record<string, unknown> {
    return document.toObject ? document.toObject() : { ...document };
  }

  private normalizeRole(role: string): string {
    const normalized = role
      .toLowerCase()
      .replaceAll('Ã¼', 'ue')
      .replaceAll('ü', 'ue')
      .trim();
    const aliases: Record<string, string> = {
      filialleiter: 'location_manager',
      restaurantleiter: 'location_manager',
      location_manager: 'location_manager',
      service: 'waiter',
      waiter: 'waiter',
      kueche: 'kitchen',
      kitchen: 'kitchen',
      bar: 'counter',
      theke: 'counter',
      counter: 'counter',
      kasse: 'cashier',
      cashier: 'cashier',
      lager: 'inventory_manager',
      inventory_manager: 'inventory_manager',
      tellerwaescher: 'dishwasher',
      spuelkueche: 'dishwasher',
      dishwasher: 'dishwasher',
      mitarbeiter: 'staff',
      employee: 'staff',
      staff: 'staff',
    };
    return aliases[normalized] ?? normalized;
  }

  private validateObjectId(id: string, label: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
