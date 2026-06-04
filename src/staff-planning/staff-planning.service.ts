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
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateAbsenceDto } from './dto/absence.dto';
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
    } else if (!this.accessPolicy.isPlatformAdmin(actor)) {
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
      .findByIdAndUpdate(id, payload, { new: true, runValidators: true })
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
          startTime,
          endTime,
          assignedUserIds,
        },
        { new: true, runValidators: true },
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
        { new: true, runValidators: true },
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

  async findAbsences(
    actor: AuthenticatedUser,
    filters: { userId?: string } = {},
  ) {
    const query: Record<string, unknown> = {};

    if (this.isStaffManager(actor)) {
      if (filters.userId) {
        query.userId = filters.userId;
      } else {
        const manageable = await this.getManageableUserIds(actor);
        query.userId = { $in: manageable };
      }
    } else {
      query.userId = actor.sub;
    }

    return this.absenceModel.find(query).sort({ startDate: -1 }).exec();
  }

  async createAbsence(payload: CreateAbsenceDto, actor: AuthenticatedUser) {
    const userId = payload.userId ?? actor.sub;
    await this.assertCanWriteOwnOrManage(actor, userId);
    this.assertValidDateRange(payload.startDate, payload.endDate);
    const user = await this.getUserOrThrow(userId);
    const absence = await this.absenceModel.create({
      ...payload,
      userId,
      companyId: user.companyId ?? actor.companyId,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      status: StaffAbsenceStatus.Requested,
    });

    await this.writeAudit(actor, 'staff.absence.requested', {
      newValue: this.snapshot(absence),
    });
    await this.notifyManagersForUser(
      user,
      'staff.absence.requested',
      'Eine Abwesenheit wurde beantragt.',
    );

    return absence;
  }

  approveAbsence(id: string, actor: AuthenticatedUser) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Approved,
      actor,
      'staff.absence.approved',
    );
  }

  rejectAbsence(id: string, actor: AuthenticatedUser) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Rejected,
      actor,
      'staff.absence.rejected',
    );
  }

  cancelAbsence(id: string, actor: AuthenticatedUser) {
    return this.setAbsenceStatus(
      id,
      StaffAbsenceStatus.Cancelled,
      actor,
      'staff.absence.cancelled',
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
  ) {
    const absence = await this.getAbsenceOrThrow(id);
    const user = await this.getUserOrThrow(absence.userId);
    await this.assertCanManageUserForStaff(actor, user);
    const previousValue = this.snapshot(absence);
    absence.status = status;
    if (
      [StaffAbsenceStatus.Approved, StaffAbsenceStatus.Rejected].includes(
        status,
      )
    ) {
      absence.approvedBy = actor.sub;
      absence.approvedAt = new Date();
    }
    const saved = await absence.save();
    await this.writeAudit(actor, action, {
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
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (!this.isStaffManager(actor) || filters.mine) {
      query.assignedUserIds = actor.sub;
    }
    if (filters.departmentId) query.departmentId = filters.departmentId;
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
    await this.assertCanManageUserForStaff(options.actor, user);
    const locationIds = this.getUserLocationIds(user);
    if (locationIds.length && !locationIds.includes(options.locationId)) {
      throw new BadRequestException(
        'Mitarbeiter ist diesem Standort nicht zugewiesen',
      );
    }
    if (
      options.departmentId &&
      user.departmentIds?.length &&
      !user.departmentIds.includes(options.departmentId)
    ) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum benoetigten Department',
      );
    }
    if (
      user.roles?.length &&
      !this.roleMatches(user.roles, options.roleNeeded)
    ) {
      throw new BadRequestException(
        'Mitarbeiter passt nicht zur benoetigten Rolle',
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
  ): Promise<string[]> {
    const query = await this.accessPolicy.getManageableUsersFilter(actor);
    const users = await this.userModel.find(query).select('_id').exec();
    return users.map((user) => user._id.toString());
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
      this.accessPolicy.isPlatformAdmin(actor) ||
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
    return role
      .toLowerCase()
      .replaceAll('Ã¼', 'ue')
      .replaceAll('ü', 'ue')
      .trim();
  }

  private validateObjectId(id: string, label: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
