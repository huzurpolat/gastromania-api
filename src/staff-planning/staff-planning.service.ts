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
  Department,
  DepartmentDocument,
} from '../departments/schemas/department.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { RealtimeService } from '../realtime/realtime.service';
import {
  TimeEntry,
  TimeEntryDocument,
  TimeEntryStatus,
} from '../time-tracking/schemas/time-entry.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ForecastService } from '../reports/forecast.service';
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
  GenerateShiftSuggestionsDto,
  ShiftSuggestionQueryDto,
} from './dto/shift-suggestion.dto';
import {
  ApplyStaffingPlanItemDto,
  GenerateStaffingPlanDto,
  StaffingAssistantPlanQueryDto,
} from './dto/staffing-assistant.dto';
import {
  PublishStaffScheduleDto,
  StaffMyScheduleQueryDto,
  StaffSchedulePublicationQueryDto,
} from './dto/schedule-publication.dto';
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
import { WorkingTimeAccountQueryDto } from './dto/working-time-account.dto';
import { UpdateWorkingTimeSettingsDto } from './dto/working-time-settings.dto';
import {
  ShiftSwapRequest,
  ShiftSwapRequestDocument,
  ShiftSwapStatus,
  ShiftSwapType,
} from './schemas/shift-swap-request.schema';
import {
  ShiftSuggestion,
  ShiftSuggestionDocument,
  ShiftSuggestionStatus,
} from './schemas/shift-suggestion.schema';
import {
  ShiftTemplate,
  ShiftTemplateDocument,
} from './schemas/shift-template.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from './schemas/staff-absence.schema';
import {
  StaffAvailability,
  StaffAvailabilityDocument,
  StaffAvailabilityType,
} from './schemas/staff-availability.schema';
import {
  StaffingPlanSuggestion,
  StaffingPlanSuggestionDocument,
  StaffingPlanSuggestionItem,
  StaffingPlanSuggestionItemStatus,
  StaffingPlanSuggestionStatus,
} from './schemas/staffing-plan-suggestion.schema';
import {
  StaffNotification,
  StaffNotificationDocument,
} from './schemas/staff-notification.schema';
import {
  StaffPlanningAudit,
  StaffPlanningAuditDocument,
} from './schemas/staff-planning-audit.schema';
import {
  StaffSchedulePublication,
  StaffSchedulePublicationDocument,
  StaffSchedulePublicationStatus,
} from './schemas/staff-schedule-publication.schema';
import {
  StaffWorkingTimeSettings,
  StaffWorkingTimeSettingsDocument,
} from './schemas/staff-working-time-settings.schema';
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

export interface WorkingTimeAccountPeriod {
  mode: 'week' | 'month' | 'custom';
  start: Date;
  end: Date;
  dateFrom: string;
  dateTo: string;
  week?: number;
  year?: number;
  month?: number;
}

export type WorkingTimeWarningType =
  | 'DAILY_LIMIT_EXCEEDED'
  | 'WEEKLY_LIMIT_EXCEEDED'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'OVERTIME_THRESHOLD_EXCEEDED'
  | 'PLAN_ACTUAL_VARIANCE';

export type WorkingTimeWarningSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface WorkingTimeWarning {
  employeeId: string;
  employeeName: string;
  type: WorkingTimeWarningType;
  severity: WorkingTimeWarningSeverity;
  message: string;
  valueHours: number;
  limitHours: number;
  date?: string;
  week?: number;
  month?: number;
}

export interface WorkingTimeAccountItem {
  employeeId: string;
  employeeName: string;
  employmentType?: string;
  contractHoursPerWeek: number;
  targetHours: number;
  actualHours: number;
  overtimeHours: number;
  balanceHours: number;
  plannedHours: number;
  varianceHours: number;
  locationIds: string[];
  locationNames: string[];
  departmentIds: string[];
  departmentNames: string[];
  warnings: WorkingTimeWarning[];
}

export interface PlanActualGroupSummary {
  id: string;
  name: string;
  employeeCount: number;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
}

interface GroupAccumulator {
  id: string;
  name: string;
  employeeIds: Set<string>;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface WorkingTimeSettingsResponse {
  maxDailyHours: number;
  maxWeeklyHours: number;
  maxMonthlyHours: number;
  overtimeWarningThresholdHours: number;
  varianceWarningThresholdHours: number;
  laborCostWarningThresholdPercent: number;
}

const DEFAULT_WORKING_TIME_SETTINGS: WorkingTimeSettingsResponse = {
  maxDailyHours: 10,
  maxWeeklyHours: 48,
  maxMonthlyHours: 192,
  overtimeWarningThresholdHours: 5,
  varianceWarningThresholdHours: 2,
  laborCostWarningThresholdPercent: 30,
};

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
    @InjectModel(ShiftSuggestion.name)
    private readonly suggestionModel: Model<ShiftSuggestionDocument>,
    @InjectModel(StaffingPlanSuggestion.name)
    private readonly staffingPlanModel: Model<StaffingPlanSuggestionDocument>,
    @InjectModel(ShiftTemplate.name)
    private readonly templateModel: Model<ShiftTemplateDocument>,
    @InjectModel(StaffPlanningAudit.name)
    private readonly auditModel: Model<StaffPlanningAuditDocument>,
    @InjectModel(StaffSchedulePublication.name)
    private readonly publicationModel: Model<StaffSchedulePublicationDocument>,
    @InjectModel(StaffNotification.name)
    private readonly notificationModel: Model<StaffNotificationDocument>,
    @InjectModel(StaffWorkingTimeSettings.name)
    private readonly workingTimeSettingsModel: Model<StaffWorkingTimeSettingsDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly assignmentModel: Model<UserLocationAssignmentDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    private readonly accessPolicy: AccessPolicyService,
    private readonly realtimeService: RealtimeService,
    private readonly forecastService: ForecastService,
  ) {}

  async findShifts(actor: AuthenticatedUser, filters: StaffShiftFilters = {}) {
    const query = await this.getShiftQuery(actor, filters);
    return this.shiftModel.find(query).sort({ startTime: 1 }).exec();
  }

  async findPublication(
    actor: AuthenticatedUser,
    query: StaffSchedulePublicationQueryDto,
  ) {
    await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    const publication = await this.publicationModel
      .findOne(this.publicationQuery(actor, query))
      .exec();
    return (
      publication ?? {
        tenantId: actor.tenantId,
        companyId: actor.companyId,
        locationId: query.locationId,
        week: query.week,
        year: query.year,
        status: StaffSchedulePublicationStatus.Draft,
        changedAfterPublish: false,
      }
    );
  }

  async findNotifications(actor: AuthenticatedUser) {
    this.assertTenantUser(actor);
    return this.notificationModel
      .find({
        ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
        $or: [{ recipientUserId: actor.sub }, { userId: actor.sub }],
      })
      .sort({ createdAt: -1 })
      .limit(30)
      .exec();
  }

  async findMySchedule(actor: AuthenticatedUser, query: StaffMyScheduleQueryDto) {
    this.assertTenantUser(actor);
    const { start, end } = this.weekDateRange(query.week, query.year);
    const tenantOrCompany = actor.tenantId
      ? { tenantId: actor.tenantId }
      : { companyId: actor.companyId };
    const userMatch = this.userMatch(actor.sub);

    const monthPeriod = this.monthDateRange(
      start.getUTCMonth() + 1,
      start.getUTCFullYear(),
    );
    const [shifts, absences, availability, notifications, weekAccount, monthAccount] = await Promise.all([
      this.shiftModel
        .find({
          ...tenantOrCompany,
          assignedUserIds: actor.sub,
          status: StaffShiftStatus.Published,
          startTime: { $gte: start, $lt: end },
        })
        .sort({ startTime: 1 })
        .exec(),
      this.absenceModel
        .find({
          $and: [
            tenantOrCompany,
            userMatch,
            { endDate: { $gte: start } },
            { startDate: { $lt: end } },
          ],
        })
        .sort({ startDate: 1 })
        .exec(),
      this.availabilityModel
        .find({
          ...tenantOrCompany,
          userId: actor.sub,
          $or: [
            { date: { $gte: start, $lt: end } },
            {
              startDate: { $lt: end },
              endDate: { $gte: start },
            },
            { weekday: { $exists: true } },
          ],
        })
        .sort({ startDate: 1, date: 1, weekday: 1 })
        .exec(),
      this.findNotifications(actor),
      this.buildWorkingTimeAccount(actor, {
        mode: 'week',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        week: query.week,
        year: query.year,
      }, { employeeId: actor.sub }),
      this.buildWorkingTimeAccount(actor, monthPeriod, {
        employeeId: actor.sub,
      }),
    ]);

    const locationIds = [
      ...new Set(
        [
          ...shifts.map((shift) => shift.locationId),
          ...absences.map((absence) => absence.locationId),
          ...availability.map((entry) => entry.locationId),
        ].filter(Boolean) as string[],
      ),
    ];
    const departmentIds = [
      ...new Set(
        [
          ...shifts.map((shift) => shift.departmentId),
          ...(actor.departmentIds ?? []),
        ].filter(Boolean) as string[],
      ),
    ];

    const [locations, departments] = await Promise.all([
      locationIds.length
        ? this.locationModel
            .find({ _id: { $in: locationIds }, ...tenantOrCompany })
            .select('_id name')
            .exec()
        : Promise.resolve([]),
      departmentIds.length
        ? this.departmentModel
            .find({ _id: { $in: departmentIds }, ...tenantOrCompany })
            .select('_id name')
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      week: query.week,
      year: query.year,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      shifts,
      absences,
      availability,
      notifications,
      workingTimeAccount: weekAccount.items[0],
      monthWorkingTimeAccount: monthAccount.items[0],
      locations: locations.map((location) => ({
        _id: location._id.toString(),
        name: location.name,
      })),
      departments: departments.map((department) => ({
        _id: department._id.toString(),
        name: department.name,
      })),
    };
  }

  async findWorkingTimeAccount(
    actor: AuthenticatedUser,
    query: WorkingTimeAccountQueryDto = {},
  ) {
    this.assertTenantUser(actor);
    if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Arbeitszeitkonten');
    }
    const period = this.resolveWorkingTimePeriod(query);
    return this.buildWorkingTimeAccount(actor, period, query);
  }

  async findMyWorkingTimeAccount(
    actor: AuthenticatedUser,
    query: WorkingTimeAccountQueryDto = {},
  ) {
    this.assertTenantUser(actor);
    const period = this.resolveWorkingTimePeriod(query);
    return this.buildWorkingTimeAccount(actor, period, {
      ...query,
      employeeId: actor.sub,
    });
  }

  async findWorkingTimeSettings(actor: AuthenticatedUser) {
    this.assertTenantUser(actor);
    if (!this.isStaffManager(actor) && actor.sub) {
      throw new ForbiddenException('Keine Berechtigung fuer Arbeitszeit-Grenzwerte');
    }
    return this.getWorkingTimeSettings(actor);
  }

  async updateWorkingTimeSettings(
    actor: AuthenticatedUser,
    payload: UpdateWorkingTimeSettingsDto,
  ) {
    this.assertTenantUser(actor);
    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Nur Tenant Admins duerfen Grenzwerte bearbeiten');
    }
    const query = this.workingTimeSettingsQuery(actor);
    const updated = await this.workingTimeSettingsModel
      .findOneAndUpdate(
        query,
        {
          $set: {
            ...payload,
            ...query,
            updatedByUserId: actor.sub,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .exec();
    return this.toWorkingTimeSettingsResponse(updated);
  }

  async markNotificationRead(id: string, actor: AuthenticatedUser) {
    this.assertTenantUser(actor);
    this.validateObjectId(id, 'Benachrichtigungs-ID');
    const notification = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: id,
          ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
          $or: [{ recipientUserId: actor.sub }, { userId: actor.sub }],
        },
        { $set: { read: true, readAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!notification) {
      throw new NotFoundException('Benachrichtigung nicht gefunden');
    }
    return notification;
  }

  async markAllNotificationsRead(actor: AuthenticatedUser) {
    this.assertTenantUser(actor);
    await this.notificationModel
      .updateMany(
        {
          ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
          $or: [{ recipientUserId: actor.sub }, { userId: actor.sub }],
          read: false,
        },
        { $set: { read: true, readAt: new Date() } },
      )
      .exec();
    return { ok: true };
  }

  async publishSchedule(
    payload: PublishStaffScheduleDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    const location = await this.getLocationOrThrow(payload.locationId);
    const now = new Date();
    const publication = await this.publicationModel
      .findOneAndUpdate(
        this.publicationQuery(actor, payload),
        {
          $set: {
            tenantId: location.tenantId ?? actor.tenantId,
            companyId: location.companyId ?? actor.companyId,
            locationId: payload.locationId,
            week: payload.week,
            year: payload.year,
            status: StaffSchedulePublicationStatus.Published,
            publishedAt: now,
            publishedByUserId: actor.sub,
            changedAfterPublish: false,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .exec();

    const { start, end } = this.weekDateRange(payload.week, payload.year);
    const shifts = await this.shiftModel
      .find({
        locationId: payload.locationId,
        startTime: { $gte: start, $lt: end },
        status: { $nin: [StaffShiftStatus.Cancelled] },
      })
      .exec();

    await this.shiftModel
      .updateMany(
        {
          locationId: payload.locationId,
          startTime: { $gte: start, $lt: end },
          status: { $nin: [StaffShiftStatus.Cancelled] },
        },
        {
          $set: {
            status: StaffShiftStatus.Published,
            publishedAt: now,
            publishedBy: actor.sub,
          },
        },
      )
      .exec();

    await this.writeAudit(actor, 'staff.schedule.published', {
      locationId: payload.locationId,
      newValue: this.snapshot(publication),
    });

    const notifiedUserIds = [
      ...new Set(shifts.flatMap((shift) => shift.assignedUserIds ?? [])),
    ];
    await Promise.all(
      notifiedUserIds.map((userId) =>
        this.notify({
          tenantId: location.tenantId ?? actor.tenantId,
          companyId: location.companyId ?? actor.companyId,
          locationId: payload.locationId,
          userId,
          type: 'SCHEDULE_PUBLISHED',
          title: 'Dienstplan veröffentlicht',
          message: `Dein Dienstplan für KW ${payload.week}/${payload.year} wurde veröffentlicht.`,
          relatedEntityType: 'StaffSchedulePublication',
          relatedEntityId: publication._id.toString(),
          payload: {
            locationId: payload.locationId,
            week: payload.week,
            year: payload.year,
          },
        }),
      ),
    );

    return publication;
  }

  async findTemplates(
    actor: AuthenticatedUser,
    filters: { locationId?: string } = {},
  ) {
    const query: Record<string, unknown> = {
      companyId: actor.companyId,
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

  async findShiftSuggestions(
    actor: AuthenticatedUser,
    query: ShiftSuggestionQueryDto = {},
  ) {
    this.assertTenantUser(actor);
    const locationIds = query.locationId
      ? [query.locationId]
      : await this.accessPolicy.getReadableLocationIds(actor);
    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    }
    const filter: Record<string, unknown> = {
      ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
      locationId: { $in: locationIds },
    };
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.status) filter.status = query.status;
    if (query.week && query.year) {
      const { start, end } = this.weekDateRange(query.week, query.year);
      filter.date = { $gte: start, $lt: end };
    }
    return this.suggestionModel.find(filter).sort({ date: 1, startTime: 1 }).exec();
  }

  async generateShiftSuggestions(
    actor: AuthenticatedUser,
    payload: GenerateShiftSuggestionsDto,
  ) {
    this.assertTenantUser(actor);
    await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    const location = await this.getLocationOrThrow(payload.locationId);
    const forecast = (await this.forecastService.getForecast(actor, {
      locationId: payload.locationId,
      week: payload.week,
      year: payload.year,
    })) as {
      period: { dateFrom: string; dateTo: string };
      departments: Array<{
        id: string;
        name: string;
        locationId: string;
        forecastHours: number;
        plannedHours: number;
        missingHours: number;
      }>;
    };
    const { start, end } = this.weekDateRange(payload.week, payload.year);
    const [templates, departments, account] = await Promise.all([
      this.templateModel
        .find({
          companyId: actor.companyId,
          isActive: { $ne: false },
          $or: [{ locationId: payload.locationId }, { locationId: { $exists: false } }],
        })
        .exec(),
      this.departmentModel
        .find({ ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }) })
        .select('_id name')
        .exec(),
      this.buildWorkingTimeAccount(actor, {
        mode: 'week',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        week: payload.week,
        year: payload.year,
      }, { locationId: payload.locationId }),
    ]);
    const departmentNameById = new Map(
      departments.map((department) => [department._id.toString(), department.name]),
    );
    const balanceByUserId = new Map(
      account.items.map((item) => [item.employeeId, item.balanceHours]),
    );
    const weeklyHoursByUserId = new Map(
      account.items.map((item) => [item.employeeId, item.actualHours]),
    );
    const created: ShiftSuggestionDocument[] = [];

    for (const department of forecast.departments) {
      if (department.locationId !== payload.locationId || department.missingHours < 1) continue;
      const departmentName = departmentNameById.get(department.id) ?? department.name;
      const template = this.bestSuggestionTemplate(templates, department.id, departmentName);
      const role = template?.roleNeeded ?? this.roleForDepartmentName(departmentName);
      const date = this.suggestionDateForWeek(start, role);
      const timeWindow = this.suggestionTimeWindow(date, department.missingHours, template);
      const candidates = await this.findSuggestionCandidates({
        actor,
        locationId: payload.locationId,
        departmentId: department.id,
        role,
        date,
        startTime: timeWindow.startTime,
        endTime: timeWindow.endTime,
        balanceByUserId,
        weeklyHoursByUserId,
      });
      const existing = await this.suggestionModel
        .findOne({
          tenantId: location.tenantId ?? actor.tenantId,
          locationId: payload.locationId,
          departmentId: department.id,
          date,
          role,
          status: ShiftSuggestionStatus.Open,
        })
        .exec();
      const data = {
        tenantId: location.tenantId ?? actor.tenantId,
        companyId: location.companyId ?? actor.companyId,
        locationId: payload.locationId,
        departmentId: department.id,
        date,
        role,
        startTime: timeWindow.startTime,
        endTime: timeWindow.endTime,
        requiredHours: Math.round(department.missingHours * 100) / 100,
        suggestedUserIds: candidates.slice(0, Math.max(1, Math.ceil(department.missingHours / 4))).map((user) => user._id.toString()),
        sourceForecastId: `${payload.locationId}:${payload.week}:${payload.year}:${department.id}`,
        status: ShiftSuggestionStatus.Open,
        createdByUserId: actor.sub,
      };
      const suggestion = existing
        ? await this.suggestionModel
            .findByIdAndUpdate(existing._id, { $set: data }, { returnDocument: 'after' })
            .exec()
        : await this.suggestionModel.create(data);
      if (suggestion) created.push(suggestion);
    }
    return created;
  }

  async applyShiftSuggestion(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Vorschlags-ID');
    const suggestion = await this.suggestionModel.findById(id).exec();
    if (!suggestion) throw new NotFoundException('Schichtvorschlag nicht gefunden');
    await this.assertCanManageStaffAtLocation(actor, suggestion.locationId);
    if (suggestion.status !== ShiftSuggestionStatus.Open) {
      throw new BadRequestException('Nur offene Schichtvorschlaege koennen uebernommen werden');
    }
    const shift = await this.createShift(
      {
        locationId: suggestion.locationId,
        departmentId: suggestion.departmentId,
        roleNeeded: suggestion.role,
        title: `Vorschlag ${suggestion.role}`,
        startTime: suggestion.startTime.toISOString(),
        endTime: suggestion.endTime.toISOString(),
        requiredStaffCount: Math.max(1, suggestion.suggestedUserIds.length),
        assignedUserIds: suggestion.suggestedUserIds,
        notes: `Aus Schichtvorschlag fuer ${suggestion.requiredHours} fehlende Stunden erstellt.`,
      },
      actor,
    );
    const updated = await this.suggestionModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: ShiftSuggestionStatus.Applied,
            appliedShiftId: shift?._id?.toString(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    return updated;
  }

  async dismissShiftSuggestion(id: string, actor: AuthenticatedUser) {
    this.validateObjectId(id, 'Vorschlags-ID');
    const suggestion = await this.suggestionModel.findById(id).exec();
    if (!suggestion) throw new NotFoundException('Schichtvorschlag nicht gefunden');
    await this.assertCanManageStaffAtLocation(actor, suggestion.locationId);
    return this.suggestionModel
      .findByIdAndUpdate(
        id,
        { $set: { status: ShiftSuggestionStatus.Dismissed } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async findStaffingAssistantPlans(
    actor: AuthenticatedUser,
    query: StaffingAssistantPlanQueryDto = {},
  ) {
    this.assertTenantUser(actor);
    const locationIds = query.locationId
      ? [query.locationId]
      : await this.accessPolicy.getReadableLocationIds(actor);
    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    }
    const filter: Record<string, unknown> = {
      ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
      locationId: { $in: locationIds },
    };
    if (query.week) filter.week = query.week;
    if (query.year) filter.year = query.year;
    if (query.status) filter.status = query.status;
    return this.staffingPlanModel.find(filter).sort({ generatedAt: -1 }).exec();
  }

  async generateStaffingAssistantPlan(
    actor: AuthenticatedUser,
    payload: GenerateStaffingPlanDto,
  ) {
    this.assertTenantUser(actor);
    await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    const location = await this.getLocationOrThrow(payload.locationId);
    const { start, end } = this.weekDateRange(payload.week, payload.year);
    const [rawSuggestions, account, existingShifts] = await Promise.all([
      this.generateShiftSuggestions(actor, {
        locationId: payload.locationId,
        week: payload.week,
        year: payload.year,
      }),
      this.buildWorkingTimeAccount(actor, {
        mode: 'week',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        week: payload.week,
        year: payload.year,
      }, { locationId: payload.locationId }),
      this.shiftModel
        .find({
          ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
          locationId: payload.locationId,
          status: { $nin: [StaffShiftStatus.Cancelled] },
          startTime: { $lt: end },
          endTime: { $gt: start },
        })
        .exec(),
    ]);
    const departmentFilter = new Set(payload.departmentIds ?? []);
    const balanceByUserId = new Map(account.items.map((item) => [item.employeeId, item.balanceHours]));
    const hoursByUserId = new Map(account.items.map((item) => [item.employeeId, item.actualHours]));
    const settings = await this.getWorkingTimeSettings(actor);
    const items: StaffingPlanSuggestionItem[] = [];

    for (const suggestion of rawSuggestions) {
      if (departmentFilter.size && (!suggestion.departmentId || !departmentFilter.has(suggestion.departmentId))) {
        continue;
      }
      for (const userId of suggestion.suggestedUserIds) {
        const warnings = await this.staffingAssistantWarnings({
          actor,
          userId,
          suggestion,
          existingShifts,
          includeExistingShifts: payload.includeExistingShifts !== false,
          avoidOvertime: payload.avoidOvertime !== false,
          strictRequestedOff: payload.strictRequestedOff !== false,
          maxWeeklyHours: settings.maxWeeklyHours,
          weeklyHours: hoursByUserId.get(userId) ?? 0,
          balanceHours: balanceByUserId.get(userId) ?? 0,
        });
        if (warnings.includes('Bestehende Schicht ueberschneidet sich') && payload.includeExistingShifts !== false) {
          continue;
        }
        if (warnings.includes('Wunschfrei oder Nicht-Verfuegbarkeit vorhanden') && payload.strictRequestedOff !== false) {
          continue;
        }
        const confidence = this.staffingAssistantConfidence(warnings);
        items.push({
          id: new Types.ObjectId().toString(),
          date: suggestion.date,
          departmentId: suggestion.departmentId,
          role: suggestion.role,
          startTime: suggestion.startTime,
          endTime: suggestion.endTime,
          suggestedUserId: userId,
          sourceSuggestionId: suggestion._id.toString(),
          confidence,
          reason: this.staffingAssistantReason(confidence, warnings),
          warnings,
          status: StaffingPlanSuggestionItemStatus.Open,
        });
      }
    }

    const openPlan = await this.staffingPlanModel
      .findOne({
        tenantId: location.tenantId ?? actor.tenantId,
        locationId: payload.locationId,
        week: payload.week,
        year: payload.year,
        status: StaffingPlanSuggestionStatus.Draft,
      })
      .exec();
    const data = {
      tenantId: location.tenantId ?? actor.tenantId,
      companyId: location.companyId ?? actor.companyId,
      locationId: payload.locationId,
      week: payload.week,
      year: payload.year,
      status: StaffingPlanSuggestionStatus.Draft,
      generatedByUserId: actor.sub,
      generatedAt: new Date(),
      summary: this.staffingAssistantSummary(items),
      items,
    };
    return openPlan
      ? this.staffingPlanModel.findByIdAndUpdate(openPlan._id, { $set: data }, { returnDocument: 'after' }).exec()
      : this.staffingPlanModel.create(data);
  }

  async applyStaffingAssistantItem(
    planId: string,
    payload: ApplyStaffingPlanItemDto,
    actor: AuthenticatedUser,
  ) {
    const plan = await this.getStaffingAssistantPlanOrThrow(planId, actor);
    const item = this.getStaffingAssistantItemOrThrow(plan, payload.itemId);
    if (item.status !== StaffingPlanSuggestionItemStatus.Open) {
      throw new BadRequestException('Nur offene Vorschlaege koennen uebernommen werden');
    }
    const shift = await this.createShiftFromStaffingAssistantItem(plan, item, actor);
    item.status = StaffingPlanSuggestionItemStatus.Applied;
    item.appliedShiftId = shift?._id?.toString();
    plan.summary = this.staffingAssistantSummary(plan.items);
    if (!plan.items.some((entry) => entry.status === StaffingPlanSuggestionItemStatus.Open)) {
      plan.status = StaffingPlanSuggestionStatus.Applied;
    }
    return plan.save();
  }

  async applyAllStaffingAssistantItems(planId: string, actor: AuthenticatedUser) {
    const plan = await this.getStaffingAssistantPlanOrThrow(planId, actor);
    const errors: Array<{ itemId: string; message: string }> = [];
    for (const item of plan.items) {
      if (item.status !== StaffingPlanSuggestionItemStatus.Open) continue;
      try {
        const shift = await this.createShiftFromStaffingAssistantItem(plan, item, actor);
        item.status = StaffingPlanSuggestionItemStatus.Applied;
        item.appliedShiftId = shift?._id?.toString();
      } catch (error) {
        errors.push({
          itemId: item.id,
          message: error instanceof Error ? error.message : 'Vorschlag konnte nicht uebernommen werden',
        });
      }
    }
    plan.summary = this.staffingAssistantSummary(plan.items);
    if (!plan.items.some((entry) => entry.status === StaffingPlanSuggestionItemStatus.Open)) {
      plan.status = errors.length ? StaffingPlanSuggestionStatus.Draft : StaffingPlanSuggestionStatus.Applied;
    }
    const saved = await plan.save();
    return { plan: saved, errors };
  }

  async dismissStaffingAssistantPlan(planId: string, actor: AuthenticatedUser) {
    const plan = await this.getStaffingAssistantPlanOrThrow(planId, actor);
    plan.status = StaffingPlanSuggestionStatus.Dismissed;
    for (const item of plan.items) {
      if (item.status === StaffingPlanSuggestionItemStatus.Open) {
        item.status = StaffingPlanSuggestionItemStatus.Dismissed;
      }
    }
    plan.summary = this.staffingAssistantSummary(plan.items);
    return plan.save();
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
    await this.validateDepartment(actor, payload.departmentId);
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
    this.assertTemplateCompany(template, actor);
    if (template.locationId) {
      await this.assertCanManageStaffAtLocation(actor, template.locationId);
    } else if (!this.isStaffManager(actor)) {
      throw new ForbiddenException('Keine Berechtigung fuer Schichtvorlagen');
    }
    if (payload.locationId) {
      await this.assertCanManageStaffAtLocation(actor, payload.locationId);
    }
    await this.validateDepartment(actor, payload.departmentId);
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
    this.assertTemplateCompany(template, actor);
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
    const publication = await this.markScheduleChangedAfterPublish(shift);
    if (publication) {
      await this.notifyShiftAddedAfterPublish(shift, publication);
    }

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
    const oldPublication = await this.markScheduleChangedAfterPublish(shift);
    const newPublication = await this.markScheduleChangedAfterPublish(updated);
    await this.notifyPublishedShiftUpdate(shift, updated, oldPublication, newPublication);

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
    const publication = await this.markScheduleChangedAfterPublish(saved);
    if (publication) {
      await this.notifyShiftAddedAfterPublish(saved, publication, payload.userIds);
    }

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
    const publication = await this.markScheduleChangedAfterPublish(saved);
    if (publication) {
      await this.notifyShiftRemovedAfterPublish(shift, publication, payload.userIds);
    }

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
    const publication = await this.markScheduleChangedAfterPublish(shift);
    if (publication) {
      await this.notifyShiftRemovedAfterPublish(shift, publication);
    }
  }

  async findAvailability(
    actor: AuthenticatedUser,
    filters: { locationId?: string; userId?: string } = {},
  ) {
    const query: Record<string, unknown> = {
      companyId: actor.companyId,
    };

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
    this.assertAvailabilityWindow(payload);
    const startDate = this.availabilityStartDate(payload);
    const endDate = this.availabilityEndDate(payload, startDate);
    const startTime = payload.startTime ?? payload.availableFrom;
    const endTime = payload.endTime ?? payload.availableTo;

    const availability = await this.availabilityModel.create({
      ...payload,
      userId,
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      type: payload.type ?? StaffAvailabilityType.Available,
      date: payload.date ? new Date(payload.date) : undefined,
      startDate,
      endDate,
      startTime,
      endTime,
      availableFrom: payload.availableFrom ?? startTime,
      availableTo: payload.availableTo ?? endTime,
      createdBy: actor.sub,
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
    this.assertAvailabilityCompany(availability, actor);
    await this.assertCanWriteOwnOrManage(actor, availability.userId);
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        payload.locationId,
      );
    }
    const mergedAvailability = {
      type: payload.type ?? availability.type,
      date: payload.date ?? (availability.date ? this.dateOnly(availability.date.toISOString()) : undefined),
      startDate:
        payload.startDate ??
        (availability.startDate ? this.dateOnly(availability.startDate.toISOString()) : undefined),
      endDate:
        payload.endDate ??
        (availability.endDate ? this.dateOnly(availability.endDate.toISOString()) : undefined),
      startTime: payload.startTime ?? availability.startTime ?? payload.availableFrom ?? availability.availableFrom,
      endTime: payload.endTime ?? availability.endTime ?? payload.availableTo ?? availability.availableTo,
      availableFrom: payload.availableFrom ?? availability.availableFrom,
      availableTo: payload.availableTo ?? availability.availableTo,
    };
    this.assertAvailabilityWindow(mergedAvailability);
    const startDate = this.availabilityStartDate(mergedAvailability);
    const endDate = this.availabilityEndDate(mergedAvailability, startDate);
    const startTime = mergedAvailability.startTime ?? mergedAvailability.availableFrom;
    const endTime = mergedAvailability.endTime ?? mergedAvailability.availableTo;

    const previousValue = this.snapshot(availability);
    const updated = await this.availabilityModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          date: payload.date ? new Date(payload.date) : availability.date,
          startDate,
          endDate,
          startTime,
          endTime,
          availableFrom: payload.availableFrom ?? startTime,
          availableTo: payload.availableTo ?? endTime,
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
    this.assertAvailabilityCompany(availability, actor);
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
    this.assertTenantUser(actor);
    const tenantOrCompany = actor.tenantId
      ? { tenantId: actor.tenantId }
      : { companyId: actor.companyId };
    const readableLocationIds =
      await this.accessPolicy.getReadableLocationIds(actor);
    const shiftQuery: Record<string, unknown> = {
      ...tenantOrCompany,
      status: StaffShiftStatus.Published,
    };
    if (!this.isStaffManager(actor)) {
      shiftQuery.locationId = { $in: readableLocationIds };
    }
    const shifts = await this.shiftModel
      .find(shiftQuery)
      .select('_id tenantId companyId locationId departmentId roleNeeded title startTime endTime assignedUserIds status notes')
      .sort({ startTime: 1 })
      .exec();
    const shiftIds = shifts.map((shift) => shift._id.toString());
    const ownOrRelevant = [
      { requestedBy: actor.sub },
      { offeredByUserId: actor.sub },
      { requestedByUserId: actor.sub },
      { targetUserId: actor.sub },
    ];

    const swapQuery = this.isStaffManager(actor)
      ? { ...tenantOrCompany, shiftId: { $in: shiftIds } }
      : {
          ...tenantOrCompany,
          $or: [
            ...ownOrRelevant,
            {
              shiftId: { $in: shiftIds },
              status: { $in: [ShiftSwapStatus.Open, ShiftSwapStatus.PendingApproval] },
            },
          ],
        };

    const swaps = await this.swapModel
      .find(swapQuery)
      .sort({ createdAt: -1 })
      .exec();

    return this.enrichShiftSwaps(swaps, shifts);
  }

  async createShiftSwap(
    payload: CreateShiftSwapRequestDto,
    actor: AuthenticatedUser,
  ) {
    const shift = await this.findShift(payload.shiftId, actor);
    if (shift.status !== StaffShiftStatus.Published) {
      throw new BadRequestException(
        'Nur veroeffentlichte Schichten koennen angeboten werden',
      );
    }
    if (!shift.assignedUserIds.includes(actor.sub)) {
      throw new ForbiddenException(
        'Nur zugewiesene Mitarbeiter koennen Schichten anbieten',
      );
    }

    const swap = await this.swapModel.create({
      tenantId: shift.tenantId ?? actor.tenantId,
      companyId: shift.companyId ?? actor.companyId,
      shiftId: shift._id.toString(),
      requestedBy: actor.sub,
      offeredByUserId: actor.sub,
      type: payload.type ?? ShiftSwapType.ShiftCover,
      status: ShiftSwapStatus.Open,
      note: payload.note,
    });

    await this.writeAudit(actor, 'staff.shiftSwap.created', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      newValue: this.snapshot(swap),
    });
    await this.notifyManagersForShift(
      shift,
      'SHIFT_SWAP_CREATED',
      'Eine Schicht wurde zur Tauschboerse angeboten.',
    );
    await this.notifyShiftSwapUsers(
      swap,
      shift,
      'SHIFT_SWAP_CREATED',
      'Schichttausch erstellt',
      'Deine Schicht wurde in die Tauschboerse gestellt.',
      [actor.sub],
    );

    return (await this.enrichShiftSwaps([swap]))[0];
  }

  acceptShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.requestShiftSwap(id, actor);
  }

  async requestShiftSwap(id: string, actor: AuthenticatedUser) {
    const swap = await this.getSwapOrThrow(id);
    const shift = await this.getShiftOrThrow(swap.shiftId);
    this.assertSwapCompany(swap, actor);
    if (swap.status !== ShiftSwapStatus.Open) {
      throw new BadRequestException('Dieses Angebot ist nicht mehr offen');
    }
    const offeredByUserId = this.getSwapOfferedByUserId(swap);
    if (offeredByUserId === actor.sub) {
      throw new BadRequestException(
        'Eigene Schicht kann nicht uebernommen werden',
      );
    }
    await this.assertActorCanTakeShift(actor, shift);

    const previousValue = this.snapshot(swap);
    swap.status = ShiftSwapStatus.PendingApproval;
    swap.requestedByUserId = actor.sub;
    swap.targetUserId = actor.sub;
    const saved = await swap.save();

    await this.writeAudit(actor, 'staff.shiftSwap.requested', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      previousValue,
      newValue: this.snapshot(saved),
    });
    await this.notifyShiftSwapUsers(
      saved,
      shift,
      'SHIFT_SWAP_REQUESTED',
      'Schichtuebernahme angefragt',
      'Fuer deine angebotene Schicht wurde eine Uebernahme angefragt.',
      [offeredByUserId],
    );
    await this.notifyManagersForShift(
      shift,
      'SHIFT_SWAP_REQUESTED',
      'Eine Schichtuebernahme wartet auf Freigabe.',
    );

    return (await this.enrichShiftSwaps([saved]))[0];
  }

  approveShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.reviewShiftSwap(id, ShiftSwapStatus.Approved, actor);
  }

  rejectShiftSwap(id: string, actor: AuthenticatedUser) {
    return this.reviewShiftSwap(id, ShiftSwapStatus.Rejected, actor);
  }

  async cancelShiftSwap(id: string, actor: AuthenticatedUser) {
    const swap = await this.getSwapOrThrow(id);
    const shift = await this.getShiftOrThrow(swap.shiftId);
    this.assertSwapCompany(swap, actor);
    const offeredByUserId = this.getSwapOfferedByUserId(swap);
    const requesterId = this.getSwapRequesterUserId(swap);
    const canCancel =
      offeredByUserId === actor.sub ||
      requesterId === actor.sub ||
      (this.isStaffManager(actor) &&
        (await this.canManageShiftLocation(actor, shift.locationId)));
    if (!canCancel) {
      throw new ForbiddenException('Schichttausch darf nicht storniert werden');
    }
    if (
      [ShiftSwapStatus.Approved, ShiftSwapStatus.Rejected, ShiftSwapStatus.Cancelled].includes(
        swap.status,
      )
    ) {
      throw new BadRequestException('Dieser Schichttausch ist abgeschlossen');
    }

    const previousValue = this.snapshot(swap);
    swap.status = ShiftSwapStatus.Cancelled;
    swap.reviewedByUserId = actor.sub;
    swap.reviewedAt = new Date();
    const saved = await swap.save();

    await this.writeAudit(actor, 'staff.shiftSwap.cancelled', {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      previousValue,
      newValue: this.snapshot(saved),
    });
    await this.notifyShiftSwapUsers(
      saved,
      shift,
      'SHIFT_SWAP_CANCELLED',
      'Schichttausch storniert',
      'Ein Schichttausch wurde storniert.',
      [offeredByUserId, requesterId].filter(Boolean) as string[],
    );

    return (await this.enrichShiftSwaps([saved]))[0];
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
    await this.markScheduleChangedAfterPublish(saved);
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

  private assertAvailabilityWindow(payload: {
    date?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    availableFrom?: string;
    availableTo?: string;
  }): void {
    const startDate = this.availabilityStartDate(payload);
    const endDate = this.availabilityEndDate(payload, startDate);
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('Enddatum muss nach dem Startdatum liegen');
    }

    const startTime = payload.startTime ?? payload.availableFrom;
    const endTime = payload.endTime ?? payload.availableTo;
    if (startTime || endTime) {
      if (!startTime || !endTime) {
        throw new BadRequestException('Start- und Endzeit muessen gemeinsam angegeben werden');
      }
      this.assertTimeWindow(startTime, endTime);
    }
  }

  private availabilityStartDate(payload: { date?: string; startDate?: string }): Date | undefined {
    const value = payload.startDate ?? payload.date;
    return value ? new Date(this.dateOnly(value)) : undefined;
  }

  private availabilityEndDate(
    payload: { date?: string; endDate?: string },
    fallback?: Date,
  ): Date | undefined {
    const value = payload.endDate ?? payload.date;
    return value ? new Date(this.dateOnly(value)) : fallback;
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

  private bestSuggestionTemplate(
    templates: ShiftTemplateDocument[],
    departmentId: string,
    departmentName: string,
  ): ShiftTemplateDocument | undefined {
    const normalized = departmentName.toLowerCase();
    return (
      templates.find((template) => template.departmentId === departmentId) ??
      templates.find((template) => template.name.toLowerCase().includes(normalized)) ??
      templates.find((template) => normalized.includes(template.roleNeeded.toLowerCase())) ??
      templates[0]
    );
  }

  private roleForDepartmentName(name: string): string {
    const normalized = name.toLowerCase();
    if (normalized.includes('kueche') || normalized.includes('küche')) return 'KITCHEN';
    if (normalized.includes('theke') || normalized.includes('bar')) return 'COUNTER';
    if (normalized.includes('kasse')) return 'CASHIER';
    if (normalized.includes('lager')) return 'INVENTORY_MANAGER';
    return 'WAITER';
  }

  private suggestionDateForWeek(weekStart: Date, role: string): Date {
    const date = new Date(weekStart);
    const offset = ['KITCHEN', 'COUNTER', 'CASHIER'].includes(role) ? 5 : 4;
    date.setUTCDate(date.getUTCDate() + offset);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private suggestionTimeWindow(
    date: Date,
    missingHours: number,
    template?: ShiftTemplateDocument,
  ): { startTime: Date; endTime: Date } {
    const start = new Date(date);
    const end = new Date(date);
    const [startHour, startMinute] = (template?.startTime ?? '18:00')
      .split(':')
      .map((value) => Number(value));
    start.setUTCHours(startHour || 18, startMinute || 0, 0, 0);
    if (template?.endTime) {
      const [endHour, endMinute] = template.endTime.split(':').map((value) => Number(value));
      end.setUTCHours(endHour || 22, endMinute || 0, 0, 0);
      if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
      return { startTime: start, endTime: end };
    }
    const duration = Math.max(2, Math.min(8, Math.ceil(missingHours)));
    end.setTime(start.getTime() + duration * 3600000);
    return { startTime: start, endTime: end };
  }

  private staffingAssistantSummary(items: StaffingPlanSuggestionItem[]) {
    const totalSuggestedHours = items.reduce(
      (total, item) => total + this.hoursBetween(item.startTime, item.endTime),
      0,
    );
    return {
      totalItems: items.length,
      openItems: items.filter((item) => item.status === StaffingPlanSuggestionItemStatus.Open).length,
      appliedItems: items.filter((item) => item.status === StaffingPlanSuggestionItemStatus.Applied).length,
      dismissedItems: items.filter((item) => item.status === StaffingPlanSuggestionItemStatus.Dismissed).length,
      warningItems: items.filter((item) => item.warnings?.length).length,
      totalSuggestedHours: Math.round(totalSuggestedHours * 100) / 100,
    };
  }

  private staffingAssistantConfidence(warnings: string[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!warnings.length) return 'HIGH';
    if (warnings.length <= 1) return 'MEDIUM';
    return 'LOW';
  }

  private staffingAssistantReason(confidence: 'LOW' | 'MEDIUM' | 'HIGH', warnings: string[]): string {
    if (confidence === 'HIGH') return 'Passende Rolle, Standort und Verfuegbarkeit';
    if (warnings.some((warning) => warning.includes('Ueberstunden'))) {
      return 'Passende Rolle, aber Ueberstundenrisiko';
    }
    if (warnings.some((warning) => warning.includes('Wunschfrei'))) {
      return 'Passende Rolle, aber Verfuegbarkeitswarnung';
    }
    return 'Passende Rolle mit Planungswarnung';
  }

  private async staffingAssistantWarnings(options: {
    actor: AuthenticatedUser;
    userId: string;
    suggestion: ShiftSuggestionDocument;
    existingShifts: StaffShiftDocument[];
    includeExistingShifts: boolean;
    avoidOvertime: boolean;
    strictRequestedOff: boolean;
    maxWeeklyHours: number;
    weeklyHours: number;
    balanceHours: number;
  }): Promise<string[]> {
    const warnings: string[] = [];
    const hours = this.hoursBetween(options.suggestion.startTime, options.suggestion.endTime);
    if (
      options.includeExistingShifts &&
      this.hasShiftOverlapForUser(options.existingShifts, options.userId, options.suggestion.startTime, options.suggestion.endTime)
    ) {
      warnings.push('Bestehende Schicht ueberschneidet sich');
    }
    if (options.avoidOvertime && options.weeklyHours + hours > options.maxWeeklyHours) {
      warnings.push('Ueberstunden-Grenzwert wuerde ueberschritten');
    }
    if (options.avoidOvertime && options.balanceHours > DEFAULT_WORKING_TIME_SETTINGS.overtimeWarningThresholdHours) {
      warnings.push('Arbeitszeitkonto bereits positiv');
    }
    const availability = await this.suggestionAvailabilityState(
      options.userId,
      options.suggestion.locationId,
      options.suggestion.date,
      options.actor.tenantId ? { tenantId: options.actor.tenantId } : { companyId: options.actor.companyId },
    );
    if (availability.blocked) {
      warnings.push('Wunschfrei oder Nicht-Verfuegbarkeit vorhanden');
    }
    return warnings;
  }

  private async getStaffingAssistantPlanOrThrow(
    planId: string,
    actor: AuthenticatedUser,
  ): Promise<StaffingPlanSuggestionDocument> {
    this.validateObjectId(planId, 'Besetzungsplan-ID');
    const plan = await this.staffingPlanModel.findById(planId).exec();
    if (!plan) throw new NotFoundException('Besetzungsplan nicht gefunden');
    if (actor.tenantId && plan.tenantId !== actor.tenantId) {
      throw new NotFoundException('Besetzungsplan nicht gefunden');
    }
    if (!actor.tenantId && actor.companyId && plan.companyId !== actor.companyId) {
      throw new NotFoundException('Besetzungsplan nicht gefunden');
    }
    await this.assertCanManageStaffAtLocation(actor, plan.locationId);
    return plan;
  }

  private getStaffingAssistantItemOrThrow(
    plan: StaffingPlanSuggestionDocument,
    itemId: string,
  ): StaffingPlanSuggestionItem {
    const item = plan.items.find((entry) => entry.id === itemId);
    if (!item) throw new NotFoundException('Besetzungsvorschlag nicht gefunden');
    return item;
  }

  private async createShiftFromStaffingAssistantItem(
    plan: StaffingPlanSuggestionDocument,
    item: StaffingPlanSuggestionItem,
    actor: AuthenticatedUser,
  ) {
    const duplicate = await this.shiftModel
      .findOne({
        ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
        locationId: plan.locationId,
        roleNeeded: item.role,
        assignedUserIds: item.suggestedUserId,
        status: { $nin: [StaffShiftStatus.Cancelled] },
        startTime: item.startTime,
        endTime: item.endTime,
      })
      .exec();
    if (duplicate) throw new BadRequestException('Diese Schicht wurde bereits uebernommen');
    return this.createShift(
      {
        locationId: plan.locationId,
        departmentId: item.departmentId,
        roleNeeded: item.role,
        title: `Auto-Besetzung ${item.role}`,
        startTime: item.startTime.toISOString(),
        endTime: item.endTime.toISOString(),
        requiredStaffCount: 1,
        assignedUserIds: [item.suggestedUserId],
        notes: `Aus Auto-Besetzungsassistent fuer KW ${plan.week}/${plan.year}. ${item.reason}`,
      },
      actor,
    );
  }

  private hasShiftOverlapForUser(
    shifts: StaffShiftDocument[],
    userId: string,
    startTime: Date,
    endTime: Date,
  ): boolean {
    return shifts.some(
      (shift) =>
        shift.assignedUserIds?.includes(userId) &&
        shift.startTime < endTime &&
        shift.endTime > startTime,
    );
  }

  private hoursBetween(startTime: Date, endTime: Date): number {
    return Math.max(0, (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3600000);
  }

  private async findSuggestionCandidates(options: {
    actor: AuthenticatedUser;
    locationId: string;
    departmentId?: string;
    role: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    balanceByUserId: Map<string, number>;
    weeklyHoursByUserId: Map<string, number>;
  }): Promise<UserDocument[]> {
    const tenantOrCompany = options.actor.tenantId
      ? { tenantId: options.actor.tenantId }
      : { companyId: options.actor.companyId };
    const users = await this.userModel
      .find({
        ...tenantOrCompany,
        isActive: true,
        $or: [
          { locationId: options.locationId },
          { locationIds: options.locationId },
          { managedLocationIds: options.locationId },
          { 'locationAssignments.locationId': options.locationId },
        ],
      })
      .exec();
    const available: Array<{ user: UserDocument; explicitAvailability: boolean }> = [];
    for (const user of users) {
      const userId = user._id.toString();
      if (!this.userCanFillSuggestion(user, options.departmentId, options.role)) continue;
      if (await this.hasBlockingAbsence(userId, options.startTime, options.endTime, tenantOrCompany)) continue;
      const availability = await this.suggestionAvailabilityState(
        userId,
        options.locationId,
        options.date,
        tenantOrCompany,
      );
      if (availability.blocked) continue;
      available.push({ user, explicitAvailability: availability.available });
    }
    return available
      .sort((first, second) => {
        const explicit = Number(second.explicitAvailability) - Number(first.explicitAvailability);
        if (explicit !== 0) return explicit;
        const firstBalance = options.balanceByUserId.get(first.user._id.toString()) ?? 0;
        const secondBalance = options.balanceByUserId.get(second.user._id.toString()) ?? 0;
        if (firstBalance !== secondBalance) return firstBalance - secondBalance;
        const firstHours = options.weeklyHoursByUserId.get(first.user._id.toString()) ?? 0;
        const secondHours = options.weeklyHoursByUserId.get(second.user._id.toString()) ?? 0;
        if (firstHours !== secondHours) return firstHours - secondHours;
        return Number(this.userHasPrimaryLocation(second.user, options.locationId)) -
          Number(this.userHasPrimaryLocation(first.user, options.locationId));
      })
      .map((entry) => entry.user);
  }

  private userCanFillSuggestion(
    user: UserDocument,
    departmentId: string | undefined,
    role: string,
  ): boolean {
    const candidate = user as UserDocument & {
      departmentId?: string;
      role?: string;
      locationAssignments?: Array<{ role?: string }>;
    };
    const userDepartments = [
      candidate.departmentId,
      ...(candidate.departmentIds ?? []),
    ].filter(Boolean);
    if (departmentId && userDepartments.length && !userDepartments.includes(departmentId)) {
      return false;
    }
    const roleValues = [
      candidate.role,
      ...(candidate.roles ?? []),
      ...(candidate.locationAssignments ?? []).map((assignment) => assignment.role),
    ].filter(Boolean);
    if (!roleValues.length) return true;
    return roleValues.some((value) => String(value).toLowerCase() === role.toLowerCase());
  }

  private async hasBlockingAbsence(
    userId: string,
    startTime: Date,
    endTime: Date,
    tenantOrCompany: Record<string, unknown>,
  ): Promise<boolean> {
    const absence = await this.absenceModel
      .findOne({
        ...tenantOrCompany,
        ...this.userMatch(userId),
        status: StaffAbsenceStatus.Approved,
        type: { $in: [StaffAbsenceType.Vacation, StaffAbsenceType.Sick, StaffAbsenceType.Unavailable] },
        startDate: { $lt: endTime },
        endDate: { $gte: startTime },
      })
      .exec();
    return Boolean(absence);
  }

  private async suggestionAvailabilityState(
    userId: string,
    locationId: string,
    date: Date,
    tenantOrCompany: Record<string, unknown>,
  ): Promise<{ blocked: boolean; available: boolean }> {
    const weekday = date.getUTCDay();
    const entries = await this.availabilityModel
      .find({
        ...tenantOrCompany,
        userId,
        $or: [
          { locationId },
          { locationId: { $exists: false } },
          { locationId: '' },
        ],
        $and: [
          {
            $or: [
              { date },
              { startDate: { $lte: date }, endDate: { $gte: date } },
              { weekday },
            ],
          },
        ],
      })
      .exec();
    return {
      blocked: entries.some((entry) =>
        [StaffAvailabilityType.Unavailable, StaffAvailabilityType.RequestedOff].includes(entry.type),
      ),
      available: entries.some((entry) => entry.type === StaffAvailabilityType.Available),
    };
  }

  private userHasPrimaryLocation(user: UserDocument, locationId: string): boolean {
    const candidate = user as UserDocument & {
      locationAssignments?: Array<{ locationId?: string; isPrimary?: boolean }>;
    };
    return (
      candidate.locationId === locationId ||
      candidate.locationAssignments?.some(
        (assignment) => assignment.locationId === locationId && assignment.isPrimary,
      ) === true
    );
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

  private async reviewShiftSwap(
    id: string,
    status: ShiftSwapStatus.Approved | ShiftSwapStatus.Rejected,
    actor: AuthenticatedUser,
  ) {
    const swap = await this.getSwapOrThrow(id);
    const shift = await this.getShiftOrThrow(swap.shiftId);

    await this.assertCanManageStaffAtLocation(actor, shift.locationId);
    this.assertSwapCompany(swap, actor);
    if (swap.status !== ShiftSwapStatus.PendingApproval) {
      throw new BadRequestException(
        'Nur wartende Schichttauschanfragen koennen geprueft werden',
      );
    }
    const offeredByUserId = this.getSwapOfferedByUserId(swap);
    const requesterId = this.getSwapRequesterUserId(swap);
    if (!requesterId) {
      throw new BadRequestException('Keine Uebernahme-Anfrage vorhanden');
    }

    const previousValue = this.snapshot(swap);
    swap.status = status;
    swap.reviewedByUserId = actor.sub;
    swap.reviewedAt = new Date();
    const saved = await swap.save();

    if (status === ShiftSwapStatus.Approved) {
      shift.assignedUserIds = [
        ...shift.assignedUserIds.filter(
          (userId) => userId !== offeredByUserId,
        ),
        requesterId,
      ];
      await shift.save();
      await this.markScheduleChangedAfterPublish(shift);
    }

    await this.writeAudit(actor, `staff.shiftSwap.${status}`, {
      locationId: shift.locationId,
      shiftId: shift._id.toString(),
      previousValue,
      newValue: this.snapshot(saved),
    });
    const approved = status === ShiftSwapStatus.Approved;
    await this.notifyShiftSwapUsers(
      saved,
      shift,
      approved ? 'SHIFT_SWAP_APPROVED' : 'SHIFT_SWAP_REJECTED',
      approved ? 'Schichttausch genehmigt' : 'Schichttausch abgelehnt',
      approved
        ? 'Eine Schichtuebernahme wurde genehmigt.'
        : 'Eine Schichtuebernahme wurde abgelehnt.',
      [offeredByUserId, requesterId],
    );

    return (await this.enrichShiftSwaps([saved]))[0];
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
    if (!this.isStaffManager(actor)) {
      query.status = StaffShiftStatus.Published;
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
    if (filters.status && this.isStaffManager(actor)) query.status = filters.status;
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
      (this.isStaffManager(actor) ||
        (shift.status === StaffShiftStatus.Published &&
          shift.assignedUserIds.includes(actor.sub)))
    );
  }

  private publicationQuery(
    actor: AuthenticatedUser,
    query: StaffSchedulePublicationQueryDto,
  ): Record<string, unknown> {
    return {
      ...(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId }),
      locationId: query.locationId,
      week: query.week,
      year: query.year,
    };
  }

  private async markScheduleChangedAfterPublish(
    shift: Pick<
      StaffShiftDocument,
      'tenantId' | 'companyId' | 'locationId' | 'startTime'
    >,
  ): Promise<StaffSchedulePublicationDocument | null> {
    const { week, year } = this.isoWeekParts(new Date(shift.startTime));
    return this.publicationModel
      .findOneAndUpdate(
        {
          ...(shift.tenantId ? { tenantId: shift.tenantId } : { companyId: shift.companyId }),
          locationId: shift.locationId,
          week,
          year,
          status: {
            $in: [
              StaffSchedulePublicationStatus.Published,
              StaffSchedulePublicationStatus.ChangedAfterPublish,
            ],
          },
        },
        {
          $set: {
            status: StaffSchedulePublicationStatus.ChangedAfterPublish,
            changedAfterPublish: true,
          },
        },
        { new: true },
      )
      .exec();
  }

  private async notifyPublishedShiftUpdate(
    previous: StaffShiftDocument,
    current: StaffShiftDocument,
    previousPublication: StaffSchedulePublicationDocument | null,
    currentPublication: StaffSchedulePublicationDocument | null,
  ): Promise<void> {
    const previousUsers = new Set(previous.assignedUserIds ?? []);
    const currentUsers = new Set(current.assignedUserIds ?? []);
    const removedUsers = [...previousUsers].filter((userId) => !currentUsers.has(userId));
    const addedUsers = [...currentUsers].filter((userId) => !previousUsers.has(userId));
    const changedUsers = [...currentUsers].filter((userId) => previousUsers.has(userId));

    if (previousPublication) {
      await this.notifyShiftRemovedAfterPublish(previous, previousPublication, removedUsers);
    }
    if (currentPublication) {
      await this.notifyShiftAddedAfterPublish(current, currentPublication, addedUsers);
      await this.notifyShiftChangedAfterPublish(current, currentPublication, changedUsers);
    }
  }

  private async notifyShiftAddedAfterPublish(
    shift: StaffShiftDocument,
    publication: StaffSchedulePublicationDocument,
    userIds = shift.assignedUserIds ?? [],
  ): Promise<void> {
    await this.notifyShiftUsers(
      shift,
      publication,
      userIds,
      'SHIFT_ADDED_AFTER_PUBLISH',
      'Neue Schicht im veröffentlichten Dienstplan',
      'Dir wurde eine neue Schicht im veröffentlichten Dienstplan hinzugefügt.',
    );
  }

  private async notifyShiftChangedAfterPublish(
    shift: StaffShiftDocument,
    publication: StaffSchedulePublicationDocument,
    userIds = shift.assignedUserIds ?? [],
  ): Promise<void> {
    await this.notifyShiftUsers(
      shift,
      publication,
      userIds,
      'SHIFT_CHANGED',
      'Schicht geändert',
      'Deine Schicht im veröffentlichten Dienstplan wurde geändert.',
    );
  }

  private async notifyShiftRemovedAfterPublish(
    shift: StaffShiftDocument,
    publication: StaffSchedulePublicationDocument,
    userIds = shift.assignedUserIds ?? [],
  ): Promise<void> {
    await this.notifyShiftUsers(
      shift,
      publication,
      userIds,
      'SHIFT_DELETED',
      'Schicht entfernt',
      'Deine Schicht im veröffentlichten Dienstplan wurde entfernt.',
    );
  }

  private async notifyShiftUsers(
    shift: StaffShiftDocument,
    publication: StaffSchedulePublicationDocument,
    userIds: string[],
    type: string,
    title: string,
    message: string,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    await Promise.all(
      uniqueUserIds.map((userId) =>
        this.notify({
          tenantId: shift.tenantId ?? publication.tenantId,
          companyId: shift.companyId ?? publication.companyId,
          locationId: shift.locationId,
          userId,
          type,
          title,
          message,
          relatedEntityType: 'StaffShift',
          relatedEntityId: shift._id.toString(),
          payload: {
            shiftId: shift._id.toString(),
            locationId: shift.locationId,
            week: publication.week,
            year: publication.year,
          },
        }),
      ),
    );
  }

  private weekDateRange(week: number, year: number): { start: Date; end: Date } {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const start = new Date(jan4);
    start.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { start, end };
  }

  private monthDateRange(
    month: number,
    year: number,
  ): WorkingTimeAccountPeriod {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return {
      mode: 'month',
      start,
      end,
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      month,
      year,
    };
  }

  private resolveWorkingTimePeriod(
    query: WorkingTimeAccountQueryDto,
  ): WorkingTimeAccountPeriod {
    const year = query.year ?? new Date().getUTCFullYear();
    if (query.week) {
      const { start, end } = this.weekDateRange(query.week, year);
      return {
        mode: 'week',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        week: query.week,
        year,
      };
    }
    if (query.month) {
      return this.monthDateRange(query.month, year);
    }
    if (query.dateFrom || query.dateTo) {
      const start = query.dateFrom ? new Date(query.dateFrom) : new Date();
      const end = query.dateTo ? new Date(query.dateTo) : new Date(start);
      if (!query.dateTo) end.setUTCDate(end.getUTCDate() + 7);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        start.getTime() >= end.getTime()
      ) {
        throw new BadRequestException('Ungueltiger Zeitraum');
      }
      return {
        mode: 'custom',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
      };
    }
    const parts = this.isoWeekParts(new Date());
    const { start, end } = this.weekDateRange(parts.week, parts.year);
    return {
      mode: 'week',
      start,
      end,
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      week: parts.week,
      year: parts.year,
    };
  }

  private async buildWorkingTimeAccount(
    actor: AuthenticatedUser,
    period: WorkingTimeAccountPeriod,
    filters: WorkingTimeAccountQueryDto = {},
  ) {
    const users = await this.findWorkingTimeUsers(actor, filters);
    const employeeIds = users.map((user) => user._id.toString());
    const locationScope = await this.workingTimeLocationFilter(actor, filters);
    const tenantScope = actor.tenantId
      ? { tenantId: actor.tenantId }
      : { companyId: actor.companyId };
    const [entries, shifts, settings] = await Promise.all([
      employeeIds.length
        ? this.timeEntryModel
            .find({
              tenantId: actor.tenantId,
              employeeId: { $in: employeeIds },
              status: { $in: [TimeEntryStatus.Closed, TimeEntryStatus.Corrected] },
              clockIn: { $gte: period.start, $lt: period.end },
              ...locationScope,
            })
            .exec()
        : Promise.resolve([]),
      employeeIds.length
        ? this.shiftModel
            .find({
              ...tenantScope,
              assignedUserIds: { $in: employeeIds },
              startTime: { $gte: period.start, $lt: period.end },
              status: { $ne: StaffShiftStatus.Cancelled },
              $or: [
                { status: StaffShiftStatus.Published },
                { publishedAt: { $exists: true } },
              ],
              ...locationScope,
            })
            .exec()
        : Promise.resolve([]),
      this.getWorkingTimeSettings(actor),
    ]);

    const locationIds = [
      ...new Set([
        ...users.flatMap((user) => this.getUserLocationIds(user)),
        ...entries
          .map((entry) => entry.locationId)
          .filter((id): id is string => Boolean(id)),
        ...shifts
          .map((shift) => shift.locationId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const departmentIds = [
      ...new Set([
        ...users.flatMap((user) => this.getUserDepartmentIds(user)),
        ...shifts
          .map((shift) => shift.departmentId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const [locations, departments] = await Promise.all([
      locationIds.length
        ? this.locationModel
            .find({ _id: { $in: locationIds }, ...tenantScope })
            .select('_id name')
            .exec()
        : Promise.resolve([]),
      departmentIds.length
        ? this.departmentModel
            .find({ _id: { $in: departmentIds }, ...tenantScope })
            .select('_id name')
            .exec()
        : Promise.resolve([]),
    ]);
    const locationById = new Map(
      locations.map((location) => [location._id.toString(), location.name]),
    );
    const departmentById = new Map(
      departments.map((department) => [
        department._id.toString(),
        department.name,
      ]),
    );
    const userById = new Map(
      users.map((user) => [user._id.toString(), user]),
    );

    const actualMinutesByUser = new Map<string, number>();
    const actualDailyMinutesByUser = new Map<string, Map<string, number>>();
    const actualLocationGroups = new Map<string, GroupAccumulator>();
    const actualDepartmentGroups = new Map<string, GroupAccumulator>();
    for (const entry of entries) {
      const employeeId = entry.employeeId;
      const user = userById.get(employeeId);
      const minutes =
        entry.netDurationMinutes ??
        Math.max(0, (entry.durationMinutes ?? 0) - (entry.breakMinutes ?? 0));
      const dayKey = this.isoDate(entry.clockIn);
      actualMinutesByUser.set(
        employeeId,
        (actualMinutesByUser.get(employeeId) ?? 0) + minutes,
      );
      const daily = actualDailyMinutesByUser.get(employeeId) ?? new Map<string, number>();
      daily.set(dayKey, (daily.get(dayKey) ?? 0) + minutes);
      actualDailyMinutesByUser.set(employeeId, daily);
      this.addGroupActualMinutes({
        groups: actualLocationGroups,
        id: entry.locationId,
        name: locationById.get(entry.locationId) ?? entry.locationId,
        employeeId,
        minutes,
      });
      const departmentId = user ? this.primaryDepartmentId(user) : undefined;
      if (departmentId) {
        this.addGroupActualMinutes({
          groups: actualDepartmentGroups,
          id: departmentId,
          name: departmentById.get(departmentId) ?? departmentId,
          employeeId,
          minutes,
        });
      }
    }

    const plannedMinutesByUser = new Map<string, number>();
    const plannedLocationGroups = new Map<string, GroupAccumulator>();
    const plannedDepartmentGroups = new Map<string, GroupAccumulator>();
    for (const shift of shifts) {
      const minutes = this.diffMinutes(shift.startTime, shift.endTime);
      for (const userId of shift.assignedUserIds ?? []) {
        if (!employeeIds.includes(userId)) continue;
        plannedMinutesByUser.set(
          userId,
          (plannedMinutesByUser.get(userId) ?? 0) + minutes,
        );
        this.addGroupPlannedMinutes({
          groups: plannedLocationGroups,
          id: shift.locationId,
          name: locationById.get(shift.locationId) ?? shift.locationId,
          employeeId: userId,
          minutes,
        });
        const user = userById.get(userId);
        const departmentId = shift.departmentId ?? (user ? this.primaryDepartmentId(user) : undefined);
        if (departmentId) {
          this.addGroupPlannedMinutes({
            groups: plannedDepartmentGroups,
            id: departmentId,
            name: departmentById.get(departmentId) ?? departmentId,
            employeeId: userId,
            minutes,
          });
        }
      }
    }

    const items: WorkingTimeAccountItem[] = users.map((user) => {
      const employeeId = user._id.toString();
      const targetHours = this.calculateTargetHours(user, period);
      const actualHours = this.roundHours(
        (actualMinutesByUser.get(employeeId) ?? 0) / 60,
      );
      const plannedHours = this.roundHours(
        (plannedMinutesByUser.get(employeeId) ?? 0) / 60,
      );
      const overtimeHours = this.roundHours(actualHours - targetHours);
      const varianceHours = this.roundHours(actualHours - plannedHours);
      const locationIdsForUser = this.getUserLocationIds(user);
      const departmentIdsForUser = this.getUserDepartmentIds(user);
      const employeeName = this.employeeDisplayName(user);
      const warnings = this.workingTimeWarningsFor({
        employeeId,
        employeeName,
        period,
        settings,
        actualHours,
        overtimeHours,
        varianceHours,
        dailyMinutes: actualDailyMinutesByUser.get(employeeId) ?? new Map<string, number>(),
      });
      return {
        employeeId,
        employeeName,
        employmentType: user.employmentType,
        contractHoursPerWeek: user.weeklyHours ?? 0,
        targetHours,
        actualHours,
        overtimeHours,
        balanceHours: overtimeHours,
        plannedHours,
        varianceHours,
        locationIds: locationIdsForUser,
        locationNames: locationIdsForUser.map(
          (id) => locationById.get(id) ?? id,
        ),
        departmentIds: departmentIdsForUser,
        departmentNames: departmentIdsForUser.map(
          (id) => departmentById.get(id) ?? id,
        ),
        warnings,
      };
    });

    const summary = items.reduce(
      (acc, item) => ({
        employeeCount: acc.employeeCount + 1,
        targetHours: this.roundHours(acc.targetHours + item.targetHours),
        actualHours: this.roundHours(acc.actualHours + item.actualHours),
        overtimeHours: this.roundHours(acc.overtimeHours + item.overtimeHours),
        balanceHours: this.roundHours(acc.balanceHours + item.balanceHours),
        plannedHours: this.roundHours(acc.plannedHours + item.plannedHours),
        varianceHours: this.roundHours(acc.varianceHours + item.varianceHours),
        warningCount: acc.warningCount + item.warnings.length,
        criticalWarningCount:
          acc.criticalWarningCount +
          item.warnings.filter((warning) => warning.severity === 'CRITICAL').length,
        highestOvertimeHours: Math.max(acc.highestOvertimeHours, item.overtimeHours),
        largestVarianceHours: Math.max(
          acc.largestVarianceHours,
          Math.abs(item.varianceHours),
        ),
        largestUndercoverageHours: Math.max(
          acc.largestUndercoverageHours,
          item.varianceHours < 0 ? Math.abs(item.varianceHours) : 0,
        ),
      }),
      {
        employeeCount: 0,
        targetHours: 0,
        actualHours: 0,
        overtimeHours: 0,
        balanceHours: 0,
        plannedHours: 0,
        varianceHours: 0,
        warningCount: 0,
        criticalWarningCount: 0,
        highestOvertimeHours: 0,
        largestVarianceHours: 0,
        largestUndercoverageHours: 0,
      },
    );

    return {
      period: {
        mode: period.mode,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        week: period.week,
        year: period.year,
        month: period.month,
      },
      summary,
      settings,
      items,
      locationAnalysis: this.mergePlanActualGroups(
        plannedLocationGroups,
        actualLocationGroups,
      ),
      departmentAnalysis: this.mergePlanActualGroups(
        plannedDepartmentGroups,
        actualDepartmentGroups,
      ),
      locations: locations.map((location) => ({
        _id: location._id.toString(),
        name: location.name,
      })),
      departments: departments.map((department) => ({
        _id: department._id.toString(),
        name: department.name,
      })),
    };
  }

  private async findWorkingTimeUsers(
    actor: AuthenticatedUser,
    filters: WorkingTimeAccountQueryDto,
  ): Promise<UserDocument[]> {
    if (filters.employeeId) {
      const user = await this.getUserOrThrow(filters.employeeId);
      if (actor.sub !== filters.employeeId) {
        await this.assertCanManageUserForStaff(actor, user);
      }
      return [user];
    }
    if (!this.isStaffManager(actor)) {
      return [await this.getUserOrThrow(actor.sub)];
    }
    const manageableIds = await this.getManageableUserIds(
      actor,
      filters.departmentId,
    );
    if (!manageableIds.length) return [];
    const tenantScope = actor.tenantId
      ? { tenantId: actor.tenantId }
      : { companyId: actor.companyId };
    const query: Record<string, unknown> = {
      ...tenantScope,
      _id: { $in: manageableIds },
      isActive: true,
    };
    const users = await this.userModel.find(query).exec();
    if (!filters.locationId) return users;
    await this.accessPolicy.assertCanAccessLocation(actor, filters.locationId);
    return users.filter((user) =>
      this.getUserLocationIds(user).includes(filters.locationId as string),
    );
  }

  private async workingTimeLocationFilter(
    actor: AuthenticatedUser,
    filters: WorkingTimeAccountQueryDto,
  ): Promise<Record<string, unknown>> {
    if (filters.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, filters.locationId);
      if (this.accessPolicy.isScopedLocationManager(actor)) {
        await this.accessPolicy.assertCanManageLocation(actor, filters.locationId);
      }
      return { locationId: filters.locationId };
    }
    if (this.accessPolicy.isScopedLocationManager(actor)) {
      return {
        locationId: {
          $in: await this.accessPolicy.getManageableLocationIds(actor),
        },
      };
    }
    return {};
  }

  private async getWorkingTimeSettings(
    actor: AuthenticatedUser,
  ): Promise<WorkingTimeSettingsResponse> {
    const settings = await this.workingTimeSettingsModel
      .findOne(this.workingTimeSettingsQuery(actor))
      .exec();
    return this.toWorkingTimeSettingsResponse(settings);
  }

  private workingTimeSettingsQuery(actor: AuthenticatedUser): Record<string, string> {
    return actor.tenantId
      ? { tenantId: actor.tenantId }
      : { companyId: actor.companyId ?? '' };
  }

  private toWorkingTimeSettingsResponse(
    settings?: Partial<StaffWorkingTimeSettings> | null,
  ): WorkingTimeSettingsResponse {
    return {
      maxDailyHours:
        settings?.maxDailyHours ?? DEFAULT_WORKING_TIME_SETTINGS.maxDailyHours,
      maxWeeklyHours:
        settings?.maxWeeklyHours ?? DEFAULT_WORKING_TIME_SETTINGS.maxWeeklyHours,
      maxMonthlyHours:
        settings?.maxMonthlyHours ?? DEFAULT_WORKING_TIME_SETTINGS.maxMonthlyHours,
      overtimeWarningThresholdHours:
        settings?.overtimeWarningThresholdHours ??
        DEFAULT_WORKING_TIME_SETTINGS.overtimeWarningThresholdHours,
      varianceWarningThresholdHours:
        settings?.varianceWarningThresholdHours ??
        DEFAULT_WORKING_TIME_SETTINGS.varianceWarningThresholdHours,
      laborCostWarningThresholdPercent:
        settings?.laborCostWarningThresholdPercent ??
        DEFAULT_WORKING_TIME_SETTINGS.laborCostWarningThresholdPercent,
    };
  }

  private workingTimeWarningsFor(options: {
    employeeId: string;
    employeeName: string;
    period: WorkingTimeAccountPeriod;
    settings: WorkingTimeSettingsResponse;
    actualHours: number;
    overtimeHours: number;
    varianceHours: number;
    dailyMinutes: Map<string, number>;
  }): WorkingTimeWarning[] {
    const warnings: WorkingTimeWarning[] = [];
    for (const [date, minutes] of options.dailyMinutes.entries()) {
      const valueHours = this.roundHours(minutes / 60);
      this.pushLimitWarning(warnings, {
        employeeId: options.employeeId,
        employeeName: options.employeeName,
        type: 'DAILY_LIMIT_EXCEEDED',
        label: 'Tagesarbeitszeit',
        valueHours,
        limitHours: options.settings.maxDailyHours,
        date,
      });
    }

    if (options.period.mode === 'week') {
      this.pushLimitWarning(warnings, {
        employeeId: options.employeeId,
        employeeName: options.employeeName,
        type: 'WEEKLY_LIMIT_EXCEEDED',
        label: 'Wochenarbeitszeit',
        valueHours: options.actualHours,
        limitHours: options.settings.maxWeeklyHours,
        week: options.period.week,
      });
    }

    if (options.period.mode === 'month') {
      this.pushLimitWarning(warnings, {
        employeeId: options.employeeId,
        employeeName: options.employeeName,
        type: 'MONTHLY_LIMIT_EXCEEDED',
        label: 'Monatsarbeitszeit',
        valueHours: options.actualHours,
        limitHours: options.settings.maxMonthlyHours,
        month: options.period.month,
      });
    }

    if (
      Math.abs(options.overtimeHours) >=
      options.settings.overtimeWarningThresholdHours
    ) {
      warnings.push({
        employeeId: options.employeeId,
        employeeName: options.employeeName,
        type: 'OVERTIME_THRESHOLD_EXCEEDED',
        severity: Math.abs(options.overtimeHours) >=
          options.settings.overtimeWarningThresholdHours * 2
            ? 'CRITICAL'
            : 'WARNING',
        message: `${options.employeeName} hat einen Ueberstundensaldo von ${options.overtimeHours} h.`,
        valueHours: options.overtimeHours,
        limitHours: options.settings.overtimeWarningThresholdHours,
        week: options.period.week,
        month: options.period.month,
      });
    }

    if (
      Math.abs(options.varianceHours) >=
      options.settings.varianceWarningThresholdHours
    ) {
      warnings.push({
        employeeId: options.employeeId,
        employeeName: options.employeeName,
        type: 'PLAN_ACTUAL_VARIANCE',
        severity: Math.abs(options.varianceHours) >=
          options.settings.varianceWarningThresholdHours * 2
            ? 'CRITICAL'
            : 'WARNING',
        message: `${options.employeeName} weicht um ${options.varianceHours} h von der Planung ab.`,
        valueHours: options.varianceHours,
        limitHours: options.settings.varianceWarningThresholdHours,
        week: options.period.week,
        month: options.period.month,
      });
    }

    return warnings;
  }

  private pushLimitWarning(
    warnings: WorkingTimeWarning[],
    options: {
      employeeId: string;
      employeeName: string;
      type: WorkingTimeWarningType;
      label: string;
      valueHours: number;
      limitHours: number;
      date?: string;
      week?: number;
      month?: number;
    },
  ): void {
    if (!options.limitHours || options.valueHours < options.limitHours * 0.9) {
      return;
    }
    const severity: WorkingTimeWarningSeverity =
      options.valueHours > options.limitHours ? 'CRITICAL' : 'WARNING';
    warnings.push({
      employeeId: options.employeeId,
      employeeName: options.employeeName,
      type: options.type,
      severity,
      message:
        severity === 'CRITICAL'
          ? `${options.label} von ${options.valueHours} h ueberschreitet den Grenzwert ${options.limitHours} h.`
          : `${options.label} von ${options.valueHours} h liegt nahe am Grenzwert ${options.limitHours} h.`,
      valueHours: options.valueHours,
      limitHours: options.limitHours,
      date: options.date,
      week: options.week,
      month: options.month,
    });
  }

  private addGroupPlannedMinutes(options: {
    groups: Map<string, GroupAccumulator>;
    id?: string;
    name: string;
    employeeId: string;
    minutes: number;
  }): void {
    if (!options.id) return;
    const group = this.ensureGroup(options.groups, options.id, options.name);
    group.employeeIds.add(options.employeeId);
    group.plannedMinutes += options.minutes;
  }

  private addGroupActualMinutes(options: {
    groups: Map<string, GroupAccumulator>;
    id?: string;
    name: string;
    employeeId: string;
    minutes: number;
  }): void {
    if (!options.id) return;
    const group = this.ensureGroup(options.groups, options.id, options.name);
    group.employeeIds.add(options.employeeId);
    group.actualMinutes += options.minutes;
  }

  private ensureGroup(
    groups: Map<string, GroupAccumulator>,
    id: string,
    name: string,
  ): GroupAccumulator {
    const existing = groups.get(id);
    if (existing) return existing;
    const created: GroupAccumulator = {
      id,
      name,
      employeeIds: new Set<string>(),
      plannedMinutes: 0,
      actualMinutes: 0,
    };
    groups.set(id, created);
    return created;
  }

  private mergePlanActualGroups(
    plannedGroups: Map<string, GroupAccumulator>,
    actualGroups: Map<string, GroupAccumulator>,
  ): PlanActualGroupSummary[] {
    const ids = [...new Set([...plannedGroups.keys(), ...actualGroups.keys()])];
    return ids
      .map((id) => {
        const planned = plannedGroups.get(id);
        const actual = actualGroups.get(id);
        const employeeIds = new Set<string>([
          ...Array.from(planned?.employeeIds ?? []),
          ...Array.from(actual?.employeeIds ?? []),
        ]);
        const plannedHours = this.roundHours((planned?.plannedMinutes ?? 0) / 60);
        const actualHours = this.roundHours((actual?.actualMinutes ?? 0) / 60);
        return {
          id,
          name: planned?.name ?? actual?.name ?? id,
          employeeCount: employeeIds.size,
          plannedHours,
          actualHours,
          varianceHours: this.roundHours(actualHours - plannedHours),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private calculateTargetHours(
    user: Pick<UserDocument, 'weeklyHours' | 'hireDate' | 'terminationDate'>,
    period: WorkingTimeAccountPeriod,
  ): number {
    const weeklyHours = user.weeklyHours ?? 0;
    if (!weeklyHours) return 0;
    const activeStart = user.hireDate
      ? new Date(Math.max(period.start.getTime(), new Date(user.hireDate).getTime()))
      : period.start;
    const terminationEnd = user.terminationDate
      ? new Date(new Date(user.terminationDate).getTime() + 86400000)
      : period.end;
    const activeEnd = new Date(
      Math.min(period.end.getTime(), terminationEnd.getTime()),
    );
    if (activeEnd.getTime() <= activeStart.getTime()) return 0;
    const activeDays =
      (activeEnd.getTime() - activeStart.getTime()) / 86400000;
    return this.roundHours((weeklyHours / 7) * activeDays);
  }

  private diffMinutes(start: Date, end: Date): number {
    return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
  }

  private roundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private isoDate(date: Date): string {
    return new Date(date).toISOString().slice(0, 10);
  }

  private employeeDisplayName(
    user: Pick<UserDocument, 'firstName' | 'lastName' | 'email'>,
  ): string {
    return (
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email
    );
  }

  private isoWeekParts(date: Date): { week: number; year: number } {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { week, year: target.getUTCFullYear() };
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

  private async assertActorCanTakeShift(
    actor: AuthenticatedUser,
    shift: StaffShiftDocument,
  ) {
    const user = await this.getUserOrThrow(actor.sub);
    const location = await this.getLocationOrThrow(shift.locationId);
    const tenantId = location.tenantId ?? actor.tenantId ?? user.tenantId;
    if (tenantId && user.tenantId && user.tenantId !== tenantId) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum Tenant des Standorts',
      );
    }
    const readableLocationIds =
      await this.accessPolicy.getReadableLocationIds(actor);
    if (!readableLocationIds.includes(shift.locationId)) {
      throw new ForbiddenException('Keine Berechtigung fuer diesen Standort');
    }
    const assignmentQuery: Record<string, unknown> = {
      userId: user._id.toString(),
      locationId: shift.locationId,
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
      shift.departmentId &&
      userDepartmentIds.length &&
      !userDepartmentIds.includes(shift.departmentId)
    ) {
      throw new BadRequestException(
        'Mitarbeiter gehoert nicht zum benoetigten Department',
      );
    }
    if (!this.roleMatches([assignment.role], shift.roleNeeded)) {
      throw new BadRequestException(
        'Mitarbeiter besitzt die benoetigte Standortrolle nicht',
      );
    }
    await this.assertNoOverlappingShift(
      actor.sub,
      shift.startTime,
      shift.endTime,
      shift._id.toString(),
    );
    await this.assertNoApprovedAbsence(
      actor.sub,
      shift.startTime,
      shift.endTime,
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

  private primaryDepartmentId(user: {
    departmentId?: string;
    departmentIds?: string[];
  }): string | undefined {
    return this.getUserDepartmentIds(user)[0];
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

  private assertAvailabilityCompany(
    availability: StaffAvailabilityDocument,
    actor: AuthenticatedUser,
  ): void {
    if (String(availability.companyId ?? '') !== String(actor.companyId ?? '')) {
      throw new NotFoundException('Verfuegbarkeit nicht gefunden');
    }
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

  private assertSwapCompany(
    swap: ShiftSwapRequestDocument,
    actor: AuthenticatedUser,
  ): void {
    if (actor.tenantId && swap.tenantId && swap.tenantId !== actor.tenantId) {
      throw new NotFoundException('Schichttausch nicht gefunden');
    }
    if (
      !actor.tenantId &&
      actor.companyId &&
      swap.companyId &&
      swap.companyId !== actor.companyId
    ) {
      throw new NotFoundException('Schichttausch nicht gefunden');
    }
  }

  private getSwapOfferedByUserId(swap: ShiftSwapRequestDocument): string {
    return swap.offeredByUserId ?? swap.requestedBy;
  }

  private getSwapRequesterUserId(
    swap: ShiftSwapRequestDocument,
  ): string | undefined {
    return swap.requestedByUserId ?? swap.targetUserId;
  }

  private async canManageShiftLocation(
    actor: AuthenticatedUser,
    locationId: string,
  ): Promise<boolean> {
    try {
      await this.assertCanManageStaffAtLocation(actor, locationId);
      return true;
    } catch {
      return false;
    }
  }

  private async enrichShiftSwaps(
    swaps: ShiftSwapRequestDocument[],
    knownShifts: StaffShiftDocument[] = [],
  ) {
    const shiftIds = [
      ...new Set([
        ...knownShifts.map((shift) => shift._id.toString()),
        ...swaps.map((swap) => swap.shiftId),
      ]),
    ];
    const missingShiftIds = shiftIds.filter(
      (shiftId) =>
        !knownShifts.some((shift) => shift._id.toString() === shiftId),
    );
    const missingShifts = missingShiftIds.length
      ? await this.shiftModel
          .find({ _id: { $in: missingShiftIds } })
          .select('_id tenantId companyId locationId departmentId roleNeeded title startTime endTime assignedUserIds status notes')
          .exec()
      : [];
    const shifts = [...knownShifts, ...missingShifts];
    const shiftById = new Map(
      shifts.map((shift) => [shift._id.toString(), shift]),
    );
    const locationIds = [
      ...new Set(shifts.map((shift) => shift.locationId).filter(Boolean)),
    ];
    const departmentIds = [
      ...new Set(shifts.map((shift) => shift.departmentId).filter(Boolean)),
    ] as string[];
    const [locations, departments] = await Promise.all([
      locationIds.length
        ? this.locationModel.find({ _id: { $in: locationIds } }).select('_id name').exec()
        : Promise.resolve([]),
      departmentIds.length
        ? this.departmentModel.find({ _id: { $in: departmentIds } }).select('_id name').exec()
        : Promise.resolve([]),
    ]);
    const locationById = new Map(
      locations.map((location) => [location._id.toString(), location.name]),
    );
    const departmentById = new Map(
      departments.map((department) => [
        department._id.toString(),
        department.name,
      ]),
    );

    return swaps.map((swap) => {
      const shift = shiftById.get(swap.shiftId);
      return {
        ...this.snapshot(swap),
        offeredByUserId: this.getSwapOfferedByUserId(swap),
        requestedByUserId: this.getSwapRequesterUserId(swap),
        shift: shift
          ? {
              _id: shift._id.toString(),
              locationId: shift.locationId,
              locationName:
                locationById.get(shift.locationId) ?? 'Standort',
              departmentId: shift.departmentId,
              departmentName: shift.departmentId
                ? departmentById.get(shift.departmentId) ?? 'Abteilung'
                : undefined,
              roleNeeded: shift.roleNeeded,
              title: shift.title,
              startTime: shift.startTime,
              endTime: shift.endTime,
              status: shift.status,
            }
          : undefined,
      };
    });
  }

  private async getTemplateOrThrow(id: string) {
    this.validateObjectId(id, 'Schichtvorlagen-ID');
    const template = await this.templateModel.findById(id).exec();
    if (!template) throw new NotFoundException('Schichtvorlage nicht gefunden');
    return template;
  }

  private assertTemplateCompany(
    template: ShiftTemplateDocument,
    actor: AuthenticatedUser,
  ): void {
    if (String(template.companyId ?? '') !== String(actor.companyId ?? '')) {
      throw new NotFoundException('Schichtvorlage nicht gefunden');
    }
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

  private async notifyShiftSwapUsers(
    swap: ShiftSwapRequestDocument,
    shift: StaffShiftDocument,
    type: string,
    title: string,
    message: string,
    userIds: string[],
  ) {
    const recipients = [...new Set(userIds.filter(Boolean))];
    await Promise.all(
      recipients.map((userId) =>
        this.notify({
          tenantId: swap.tenantId ?? shift.tenantId,
          companyId: swap.companyId ?? shift.companyId,
          locationId: shift.locationId,
          userId,
          recipientUserId: userId,
          type,
          title,
          message,
          relatedEntityType: 'shiftSwap',
          relatedEntityId: swap._id.toString(),
          payload: {
            swapId: swap._id.toString(),
            shiftId: shift._id.toString(),
          },
        }),
      ),
    );
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
    tenantId?: string;
    companyId?: string;
    locationId?: string;
    userId?: string;
    recipientUserId?: string;
    targetRole?: string;
    type: string;
    title?: string;
    message: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    payload: Record<string, unknown>;
  }) {
    const notification = await this.notificationModel.create({
      ...payload,
      recipientUserId: payload.recipientUserId ?? payload.userId,
      title: payload.title ?? payload.type,
      read: false,
    });
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
