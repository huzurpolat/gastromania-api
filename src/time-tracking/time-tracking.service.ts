import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuditLog, AuditLogDocument } from '../audit-logs/schemas/audit-log.schema';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  StaffShift,
  StaffShiftDocument,
  StaffShiftStatus,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  ClockOutTimeEntryDto,
  CreateTimeEntryDto,
} from './dto/create-time-entry.dto';
import { CorrectTimeEntryDto } from './dto/correct-time-entry.dto';
import { TimeEntryBreakDto } from './dto/time-entry-break.dto';
import { CreateTimeCorrectionDto } from './dto/time-correction.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import {
  WorktimeReportGroupBy,
  WorktimeReportQueryDto,
} from './dto/worktime-report.dto';
import {
  TimeCorrection,
  TimeCorrectionDocument,
  TimeCorrectionStatus,
} from './schemas/time-correction.schema';
import {
  TimeEntry,
  TimeEntryDocument,
  TimeEntryStatus,
} from './schemas/time-entry.schema';
import {
  TimeEntryBreak,
  TimeEntryBreakDocument,
} from './schemas/time-entry-break.schema';

interface ReportPeriod {
  start: Date;
  end: Date;
}

interface WorktimeScope {
  locationId?: string;
  employeeId?: string;
  locationIds?: string[];
}

export interface WorktimeReportTotals {
  plannedMinutes: number;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  vacationMinutes: number;
  sickMinutes: number;
  unpaidMinutes: number;
  otherAbsenceMinutes: number;
  varianceMinutes: number;
}

export interface WorktimeReportItem extends WorktimeReportTotals {
  groupKey: string;
  employeeId?: string;
  employeeName?: string;
  locationId?: string;
  locationName?: string;
  date?: string;
}

@Injectable()
export class TimeTrackingService {
  constructor(
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(TimeEntryBreak.name)
    private readonly timeEntryBreakModel: Model<TimeEntryBreakDocument>,
    @InjectModel(TimeCorrection.name)
    private readonly correctionModel: Model<TimeCorrectionDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly assignmentModel: Model<UserLocationAssignmentDocument>,
    @InjectModel(StaffShift.name)
    private readonly shiftModel: Model<StaffShiftDocument>,
    @InjectModel(StaffAbsence.name)
    private readonly absenceModel: Model<StaffAbsenceDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async clockIn(
    createTimeEntryDto: CreateTimeEntryDto,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    this.assertTenantUser(actor);
    const employeeId = actor.sub;

    const employee = await this.getEmployeeOrThrow(employeeId);
    const location = await this.assertCanUseLocation(
      actor,
      createTimeEntryDto.locationId,
      employee,
    );
    await this.assertEmployeeIsNotAbsent(actor, employeeId, new Date());
    if (createTimeEntryDto.shiftId) {
      const tenantId = this.resolveActorTenantId(actor);
      await this.assertShiftMatchesEmployee({
        actor,
        shiftId: createTimeEntryDto.shiftId,
        employeeId,
        locationId: createTimeEntryDto.locationId,
        tenantId: location.tenantId ?? tenantId,
      });
    }

    const openEntry = await this.timeEntryModel
      .findOne({
        employeeId,
        $or: [
          { status: TimeEntryStatus.Open },
          { clockOut: { $exists: false }, status: { $exists: false } },
        ],
      })
      .exec();

    if (openEntry) {
      throw new BadRequestException(
        'Es gibt bereits eine offene Zeiterfassung',
      );
    }

    return this.timeEntryModel.create({
      tenantId: location.tenantId ?? actor.tenantId,
      locationId: createTimeEntryDto.locationId,
      employeeId,
      shiftId: createTimeEntryDto.shiftId,
      clockIn: new Date(),
      breakMinutes: createTimeEntryDto.breakMinutes ?? 0,
      netDurationMinutes: undefined,
      status: TimeEntryStatus.Open,
      note: createTimeEntryDto.note ?? createTimeEntryDto.notes,
      notes: createTimeEntryDto.notes ?? createTimeEntryDto.note,
    });
  }

  async clockOut(
    id: string | undefined,
    actor: AuthenticatedUser,
    payload: ClockOutTimeEntryDto = {},
  ): Promise<TimeEntryDocument> {
    this.assertTenantUser(actor);
    const timeEntryId = id ?? payload.timeEntryId;
    if (timeEntryId) {
      this.validateObjectId(timeEntryId);
    }
    const entry = timeEntryId
      ? await this.timeEntryModel.findById(timeEntryId).exec()
      : await this.timeEntryModel
          .findOne({
            employeeId: actor.sub,
            $or: [
              { status: TimeEntryStatus.Open },
              { clockOut: { $exists: false }, status: { $exists: false } },
            ],
          })
          .sort({ clockIn: -1 })
          .exec();

    if (!entry) {
      throw new NotFoundException('Offener Zeiteintrag nicht gefunden');
    }

    if (entry.employeeId !== actor.sub) {
      throw new ForbiddenException(
        'Nur eigene offene Zeiteintraege koennen ausgestempelt werden',
      );
    }

    if (entry.clockOut) {
      throw new BadRequestException('Zeiteintrag ist bereits abgeschlossen');
    }

    const openBreak = await this.findOpenBreak(entry);
    if (openBreak) {
      throw new BadRequestException(
        'Offene Pause muss vor dem Ausstempeln beendet werden',
      );
    }

    entry.clockOut = new Date();
    entry.status = TimeEntryStatus.Closed;
    this.recalculateEntryDurations(entry);
    if (payload.notes) {
      entry.notes = payload.notes;
      entry.note = payload.notes;
    }
    return entry.save();
  }

  async startBreak(
    timeEntryId: string,
    actor: AuthenticatedUser,
    payload: TimeEntryBreakDto = {},
  ): Promise<TimeEntryBreakDocument> {
    const entry = await this.getEntryForOwnBreak(timeEntryId, actor);

    const openBreak = await this.findOpenBreak(entry);
    if (openBreak) {
      throw new BadRequestException('Es gibt bereits eine offene Pause');
    }

    return this.timeEntryBreakModel.create({
      tenantId: entry.tenantId,
      timeEntryId: entry._id.toString(),
      breakStartAt: new Date(),
      durationMinutes: 0,
      notes: payload.notes,
    });
  }

  async endBreak(
    timeEntryId: string,
    actor: AuthenticatedUser,
    payload: TimeEntryBreakDto = {},
  ): Promise<TimeEntryBreakDocument> {
    const entry = await this.getEntryForOwnBreak(timeEntryId, actor);
    const openBreak = await this.findOpenBreak(entry);

    if (!openBreak) {
      throw new NotFoundException('Offene Pause nicht gefunden');
    }

    const breakEndAt = new Date();
    if (breakEndAt.getTime() <= openBreak.breakStartAt.getTime()) {
      throw new BadRequestException('Pausenende muss nach Pausenbeginn liegen');
    }

    if (entry.clockOut && breakEndAt.getTime() > entry.clockOut.getTime()) {
      throw new BadRequestException(
        'Pause muss innerhalb der Arbeitszeit liegen',
      );
    }

    openBreak.breakEndAt = breakEndAt;
    openBreak.durationMinutes = this.minutesBetween(
      openBreak.breakStartAt,
      breakEndAt,
    );
    if (payload.notes) {
      openBreak.notes = payload.notes;
    }
    await openBreak.save();

    await this.refreshBreakMinutes(entry);
    return openBreak;
  }

  async findBreaks(
    timeEntryId: string,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryBreakDocument[]> {
    const entry = await this.getEntryOrThrow(timeEntryId);

    if (entry.employeeId === actor.sub) {
      this.assertTenantUser(actor);
    } else {
      await this.assertCanCorrectEntry(actor, entry);
    }

    return this.timeEntryBreakModel
      .find({ tenantId: entry.tenantId, timeEntryId: entry._id.toString() })
      .sort({ breakStartAt: 1 })
      .exec();
  }

  async getWorktimeReport(
    actor: AuthenticatedUser,
    query: WorktimeReportQueryDto,
  ): Promise<{
    dateFrom: string;
    dateTo: string;
    groupBy: WorktimeReportGroupBy;
    summary: WorktimeReportTotals;
    items: WorktimeReportItem[];
  }> {
    this.assertTenantUser(actor);
    const period = this.parseReportPeriod(query.dateFrom, query.dateTo);
    const groupBy = query.groupBy ?? 'employee';
    const scoped = await this.resolveWorktimeScope(actor, query);

    const [shifts, entries, absences] = await Promise.all([
      this.findReportShifts(actor, period, scoped),
      this.findReportEntries(actor, period, scoped),
      this.findReportAbsences(actor, period, scoped),
    ]);

    const employeeIds = new Set<string>();
    const locationIds = new Set<string>();
    for (const shift of shifts) {
      shift.assignedUserIds?.forEach((id) => employeeIds.add(id));
      locationIds.add(shift.locationId);
    }
    for (const entry of entries) {
      employeeIds.add(entry.employeeId);
      locationIds.add(entry.locationId);
    }
    for (const absence of absences) {
      employeeIds.add(this.getAbsenceEmployeeId(absence));
      if (absence.locationId) locationIds.add(absence.locationId);
    }

    const [employees, locations] = await Promise.all([
      this.findUsersByIds([...employeeIds]),
      this.findLocationsByIds([...locationIds]),
    ]);
    const employeeMap = new Map(
      employees.map((user) => [user._id.toString(), this.getUserName(user)]),
    );
    const locationMap = new Map(
      locations.map((location) => [location._id.toString(), location.name]),
    );
    const itemMap = new Map<string, WorktimeReportItem>();

    const getItem = (payload: {
      employeeId?: string;
      locationId?: string;
      date?: string;
    }) => {
      const key = this.reportGroupKey(groupBy, payload);
      const existing = itemMap.get(key);
      if (existing) return existing;
      const item: WorktimeReportItem = {
        groupKey: key,
        employeeId: payload.employeeId,
        employeeName: payload.employeeId
          ? employeeMap.get(payload.employeeId) ?? payload.employeeId
          : undefined,
        locationId: payload.locationId,
        locationName: payload.locationId
          ? locationMap.get(payload.locationId) ?? payload.locationId
          : undefined,
        date: payload.date,
        plannedMinutes: 0,
        grossMinutes: 0,
        breakMinutes: 0,
        netMinutes: 0,
        vacationMinutes: 0,
        sickMinutes: 0,
        unpaidMinutes: 0,
        otherAbsenceMinutes: 0,
        varianceMinutes: 0,
      };
      itemMap.set(key, item);
      return item;
    };

    for (const shift of shifts) {
      const minutes = this.minutesBetween(shift.startTime, shift.endTime);
      for (const employeeId of shift.assignedUserIds ?? []) {
        if (scoped.employeeId && employeeId !== scoped.employeeId) continue;
        const item = getItem({
          employeeId,
          locationId: shift.locationId,
          date: this.dateKey(shift.startTime),
        });
        item.plannedMinutes += minutes;
      }
    }

    for (const entry of entries) {
      const grossMinutes = this.entryGrossMinutes(entry);
      const breakMinutes = entry.breakMinutes ?? 0;
      const netMinutes =
        entry.netDurationMinutes ?? Math.max(0, grossMinutes - breakMinutes);
      const item = getItem({
        employeeId: entry.employeeId,
        locationId: entry.locationId,
        date: this.dateKey(entry.clockIn),
      });
      item.grossMinutes += grossMinutes;
      item.breakMinutes += breakMinutes;
      item.netMinutes += netMinutes;
    }

    for (const absence of absences) {
      this.applyAbsenceToReport(absence, shifts, period, getItem);
    }

    const items = [...itemMap.values()]
      .map((item) => ({
        ...item,
        varianceMinutes: item.netMinutes - item.plannedMinutes,
      }))
      .sort((a, b) => this.sortReportItems(a, b, groupBy));

    return {
      dateFrom: this.dateKey(period.start),
      dateTo: this.dateKey(period.end),
      groupBy,
      summary: this.sumReportItems(items),
      items,
    };
  }

  async correctTimeEntry(
    timeEntryId: string,
    actor: AuthenticatedUser,
    payload: CorrectTimeEntryDto,
  ): Promise<TimeEntryDocument> {
    const entry = await this.getEntryOrThrow(timeEntryId);
    await this.assertCanCorrectEntry(actor, entry);

    if (!payload.correctionReason?.trim()) {
      throw new BadRequestException('Korrekturgrund ist erforderlich');
    }

    const oldValues = this.snapshotTimeEntry(entry);
    const clockIn = payload.clockInAt ? new Date(payload.clockInAt) : entry.clockIn;
    const clockOut = payload.clockOutAt
      ? new Date(payload.clockOutAt)
      : entry.clockOut;
    const breakMinutes = payload.breakMinutes ?? entry.breakMinutes ?? 0;

    this.assertCorrectedRange(clockIn, clockOut, breakMinutes);

    entry.clockIn = clockIn;
    entry.clockOut = clockOut;
    entry.breakMinutes = breakMinutes;
    entry.notes = payload.notes ?? entry.notes;
    entry.note = payload.notes ?? entry.note;
    entry.correctionReason = payload.correctionReason;
    entry.correctedByUserId = actor.sub;
    entry.correctedAt = new Date();
    entry.status = TimeEntryStatus.Corrected;
    this.recalculateEntryDurations(entry);

    const savedEntry = await entry.save();
    await this.auditTimeEntryCorrection(actor, savedEntry, oldValues);
    return savedEntry;
  }

  async findMine(
    actor: AuthenticatedUser,
    filters: {
      locationId?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: TimeEntryStatus;
    } = {},
  ): Promise<TimeEntryDocument[]> {
    this.assertTenantUser(actor);
    const query = this.applyDateAndStatusFilters(
      {
        employeeId: actor.sub,
        tenantId: actor.tenantId,
      },
      filters,
    );
    if (filters.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, filters.locationId);
      query.locationId = filters.locationId;
    }
    return this.timeEntryModel.find(query).sort({ clockIn: -1 }).exec();
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: {
      locationId?: string;
      employeeId?: string;
      start?: string;
      end?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: TimeEntryStatus;
      open?: string;
    },
  ): Promise<TimeEntryDocument[]> {
    this.assertTenantUser(actor);
    const query = this.applyDateAndStatusFilters(
      { tenantId: actor.tenantId },
      {
        dateFrom: filters.dateFrom ?? filters.start,
        dateTo: filters.dateTo ?? filters.end,
        status: filters.status,
      },
    );

    if (filters.open === 'true') {
      query.status = TimeEntryStatus.Open;
    }
    if (this.accessPolicy.isManagementRole(actor)) {
      Object.assign(
        query,
        await this.accessPolicy.getScopedResourceFilter(
          actor,
          filters.locationId,
        ),
      );
      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      }
    } else if (this.accessPolicy.isScopedLocationManager(actor)) {
      if (filters.locationId) {
        await this.accessPolicy.assertCanManageLocation(
          actor,
          filters.locationId,
        );
        query.locationId = filters.locationId;
      } else {
        query.locationId = {
          $in: await this.accessPolicy.getManageableLocationIds(actor),
        };
      }
      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      }
    } else {
      query.employeeId = actor.sub;
      if (filters.locationId) {
        await this.accessPolicy.assertCanAccessLocation(
          actor,
          filters.locationId,
        );
        query.locationId = filters.locationId;
      }
    }

    return this.timeEntryModel.find(query).sort({ clockIn: -1 }).exec();
  }

  async findCorrections(
    actor: AuthenticatedUser,
    filters: { employeeId?: string; status?: TimeCorrectionStatus } = {},
  ): Promise<TimeCorrectionDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (this.accessPolicy.isManagementRole(actor)) {
      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      } else {
        const scopedEntries = await this.findAll(actor, {});
        query.timeEntryId = {
          $in: scopedEntries.map((entry) => entry._id.toString()),
        };
      }
    } else {
      query.employeeId = actor.sub;
    }

    return this.correctionModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async requestCorrection(
    payload: CreateTimeCorrectionDto,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    this.validateObjectId(payload.timeEntryId);
    const entry = await this.timeEntryModel
      .findById(payload.timeEntryId)
      .exec();
    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }
    await this.assertCanAccessEmployee(actor, entry.employeeId);
    this.assertCorrectionRange(payload, entry);

    return this.correctionModel.create({
      timeEntryId: entry._id.toString(),
      employeeId: entry.employeeId,
      locationId: entry.locationId,
      requestedClockIn: payload.requestedClockIn
        ? new Date(payload.requestedClockIn)
        : entry.clockIn,
      requestedClockOut: payload.requestedClockOut
        ? new Date(payload.requestedClockOut)
        : entry.clockOut,
      requestedBreakMinutes:
        payload.requestedBreakMinutes ?? entry.breakMinutes,
      reason: payload.reason,
      status: TimeCorrectionStatus.Requested,
    });
  }

  async approveCorrection(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    const correction = await this.getCorrectionOrThrow(id);
    this.assertCanManageTimeCorrections(actor);
    await this.assertCanAccessEmployee(actor, correction.employeeId);
    const entry = await this.timeEntryModel
      .findById(correction.timeEntryId)
      .exec();
    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }
    entry.clockIn = correction.requestedClockIn ?? entry.clockIn;
    entry.clockOut = correction.requestedClockOut ?? entry.clockOut;
    entry.breakMinutes = correction.requestedBreakMinutes;
    entry.status = TimeEntryStatus.Corrected;
    this.recalculateEntryDurations(entry);
    await entry.save();
    correction.status = TimeCorrectionStatus.Approved;
    correction.decidedBy = actor.sub;
    correction.decidedAt = new Date();
    return correction.save();
  }

  async rejectCorrection(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    const correction = await this.getCorrectionOrThrow(id);
    this.assertCanManageTimeCorrections(actor);
    await this.assertCanAccessEmployee(actor, correction.employeeId);
    correction.status = TimeCorrectionStatus.Rejected;
    correction.decidedBy = actor.sub;
    correction.decidedAt = new Date();
    return correction.save();
  }

  async update(
    id: string,
    updateTimeEntryDto: UpdateTimeEntryDto,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    this.validateObjectId(id);
    const existingEntry = await this.timeEntryModel.findById(id).exec();

    if (!existingEntry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    if (
      updateTimeEntryDto.clockIn ||
      updateTimeEntryDto.clockOut ||
      updateTimeEntryDto.breakMinutes !== undefined
    ) {
      throw new BadRequestException(
        'Zeitkorrekturen muessen ueber den Korrektur-Endpunkt mit Begruendung erfolgen',
      );
    }

    await this.assertCanAccessEmployee(actor, existingEntry.employeeId);

    const employeeId =
      updateTimeEntryDto.employeeId ?? existingEntry.employeeId;
    const locationId =
      updateTimeEntryDto.locationId ?? existingEntry.locationId;

    await this.assertCanAccessEmployee(actor, employeeId);
    await this.assertCanUseLocation(actor, locationId, employeeId);

    const clockIn = updateTimeEntryDto.clockIn
      ? new Date(updateTimeEntryDto.clockIn)
      : existingEntry.clockIn;
    const clockOut = updateTimeEntryDto.clockOut
      ? new Date(updateTimeEntryDto.clockOut)
      : existingEntry.clockOut;

    if (clockOut && clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException(
        'Arbeitsende muss nach Arbeitsbeginn liegen',
      );
    }

    const updatedEntry = await this.timeEntryModel
      .findByIdAndUpdate(
        id,
        {
          ...updateTimeEntryDto,
          employeeId,
          locationId,
          ...(updateTimeEntryDto.clockIn ? { clockIn } : {}),
          ...(updateTimeEntryDto.clockOut ? { clockOut } : {}),
          ...(clockOut
            ? this.getDurationPatch(
                clockIn,
                clockOut,
                updateTimeEntryDto.breakMinutes ?? existingEntry.breakMinutes,
              )
            : {}),
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedEntry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    return updatedEntry;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    this.validateObjectId(id);
    const entry = await this.timeEntryModel.findById(id).exec();

    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    await this.assertCanAccessEmployee(actor, entry.employeeId);
    await this.timeEntryModel.findByIdAndDelete(id).exec();
  }

  private parseReportPeriod(dateFrom: string, dateTo: string): ReportPeriod {
    if (!dateFrom || !dateTo) {
      throw new BadRequestException('dateFrom und dateTo sind erforderlich');
    }

    const start = this.reportBoundary(dateFrom, 'start');
    const end = this.reportBoundary(dateTo, 'end');

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('dateFrom muss vor dateTo liegen');
    }

    const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new BadRequestException(
        'Der Auswertungszeitraum darf maximal 12 Monate umfassen',
      );
    }

    return { start, end };
  }

  private reportBoundary(value: string, boundary: 'start' | 'end'): Date {
    const date = value.includes('T')
      ? new Date(value)
      : new Date(
          `${value}T${
            boundary === 'start' ? '00:00:00.000' : '23:59:59.999'
          }`,
        );

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ungueltiger Zeitraum');
    }

    return date;
  }

  private async resolveWorktimeScope(
    actor: AuthenticatedUser,
    query: WorktimeReportQueryDto,
  ): Promise<WorktimeScope> {
    const scope: WorktimeScope = {};

    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
      if (this.accessPolicy.isScopedLocationManager(actor)) {
        await this.accessPolicy.assertCanManageLocation(actor, query.locationId);
      }
      scope.locationId = query.locationId;
    } else if (this.accessPolicy.isScopedLocationManager(actor)) {
      scope.locationIds = await this.accessPolicy.getManageableLocationIds(actor);
    } else if (this.accessPolicy.isManagementRole(actor)) {
      const readable = await this.accessPolicy.getScopedResourceFilter(actor);
      const locationFilter = readable.locationId;
      if (
        locationFilter &&
        typeof locationFilter === 'object' &&
        '$in' in locationFilter
      ) {
        scope.locationIds = [...((locationFilter as { $in: string[] }).$in ?? [])];
      } else if (typeof locationFilter === 'string') {
        scope.locationId = locationFilter;
      }
    }

    if (query.employeeId) {
      if (actor.sub !== query.employeeId) {
        await this.assertCanAccessEmployee(actor, query.employeeId);
      }
      scope.employeeId = query.employeeId;
    } else if (!this.accessPolicy.isManagementRole(actor) && !this.accessPolicy.isScopedLocationManager(actor)) {
      scope.employeeId = actor.sub;
    }

    return scope;
  }

  private async findReportShifts(
    actor: AuthenticatedUser,
    period: ReportPeriod,
    scope: WorktimeScope,
  ): Promise<StaffShiftDocument[]> {
    const query: Record<string, unknown> = {
      tenantId: actor.tenantId,
      status: { $nin: [StaffShiftStatus.Cancelled] },
      startTime: { $lte: period.end },
      endTime: { $gte: period.start },
    };
    this.applyReportLocationScope(query, scope);
    if (scope.employeeId) query.assignedUserIds = scope.employeeId;

    return this.shiftModel.find(query).exec();
  }

  private async findReportEntries(
    actor: AuthenticatedUser,
    period: ReportPeriod,
    scope: WorktimeScope,
  ): Promise<TimeEntryDocument[]> {
    const query: Record<string, unknown> = {
      tenantId: actor.tenantId,
      status: { $in: [TimeEntryStatus.Closed, TimeEntryStatus.Corrected] },
      clockIn: { $gte: period.start, $lte: period.end },
    };
    this.applyReportLocationScope(query, scope);
    if (scope.employeeId) query.employeeId = scope.employeeId;

    return this.timeEntryModel.find(query).exec();
  }

  private async findReportAbsences(
    actor: AuthenticatedUser,
    period: ReportPeriod,
    scope: WorktimeScope,
  ): Promise<StaffAbsenceDocument[]> {
    const query: Record<string, unknown> = {
      tenantId: actor.tenantId,
      status: StaffAbsenceStatus.Approved,
      startDate: { $lte: period.end },
      endDate: { $gte: period.start },
    };
    if (scope.employeeId) {
      query.$or = [{ employeeId: scope.employeeId }, { userId: scope.employeeId }];
    }
    if (scope.locationId) {
      query.locationId = scope.locationId;
    } else if (scope.locationIds?.length) {
      query.locationId = { $in: scope.locationIds };
    }

    return this.absenceModel.find(query).exec();
  }

  private applyReportLocationScope(
    query: Record<string, unknown>,
    scope: WorktimeScope,
  ): void {
    if (scope.locationId) {
      query.locationId = scope.locationId;
    } else if (scope.locationIds?.length) {
      query.locationId = { $in: scope.locationIds };
    }
  }

  private async findUsersByIds(ids: string[]): Promise<UserDocument[]> {
    if (!ids.length) return [];
    return this.userModel.find({ _id: { $in: ids } }).exec();
  }

  private async findLocationsByIds(ids: string[]): Promise<LocationDocument[]> {
    if (!ids.length) return [];
    return this.locationModel.find({ _id: { $in: ids } }).exec();
  }

  private getUserName(user: UserDocument): string {
    const firstName = 'firstName' in user ? user.firstName : undefined;
    const lastName = 'lastName' in user ? user.lastName : undefined;
    return [firstName, lastName].filter(Boolean).join(' ') || user.email;
  }

  private reportGroupKey(
    groupBy: WorktimeReportGroupBy,
    payload: { employeeId?: string; locationId?: string; date?: string },
  ): string {
    if (groupBy === 'location') return payload.locationId ?? 'no-location';
    if (groupBy === 'day') return payload.date ?? 'no-date';
    return payload.employeeId ?? 'no-employee';
  }

  private entryGrossMinutes(entry: TimeEntryDocument): number {
    if (entry.durationMinutes !== undefined) return entry.durationMinutes;
    if (!entry.clockOut) return 0;
    return this.minutesBetween(entry.clockIn, entry.clockOut);
  }

  private applyAbsenceToReport(
    absence: StaffAbsenceDocument,
    shifts: StaffShiftDocument[],
    period: ReportPeriod,
    getItem: (payload: {
      employeeId?: string;
      locationId?: string;
      date?: string;
    }) => WorktimeReportItem,
  ): void {
    const employeeId = this.getAbsenceEmployeeId(absence);
    const relatedShifts = shifts.filter(
      (shift) =>
        shift.assignedUserIds?.includes(employeeId) &&
        (!absence.locationId || shift.locationId === absence.locationId) &&
        shift.startTime <= absence.endDate &&
        shift.endTime >= absence.startDate,
    );

    if (relatedShifts.length) {
      for (const shift of relatedShifts) {
        const minutes = this.overlapMinutes(
          shift.startTime,
          shift.endTime,
          this.maxDate(absence.startDate, period.start),
          this.minDate(absence.endDate, period.end),
        );
        if (minutes <= 0) continue;
        this.addAbsenceMinutes(
          getItem({
            employeeId,
            locationId: absence.locationId ?? shift.locationId,
            date: this.dateKey(shift.startTime),
          }),
          absence.type,
          minutes,
        );
      }
      return;
    }

    const fallbackMinutes = this.fallbackAbsenceMinutes(absence, period);
    if (fallbackMinutes <= 0) return;
    this.addAbsenceMinutes(
      getItem({
        employeeId,
        locationId: absence.locationId,
        date: this.dateKey(this.maxDate(absence.startDate, period.start)),
      }),
      absence.type,
      fallbackMinutes,
    );
  }

  private addAbsenceMinutes(
    item: WorktimeReportItem,
    type: StaffAbsenceType,
    minutes: number,
  ): void {
    if (type === StaffAbsenceType.Vacation) item.vacationMinutes += minutes;
    else if (type === StaffAbsenceType.Sick) item.sickMinutes += minutes;
    else if (type === StaffAbsenceType.Unpaid) item.unpaidMinutes += minutes;
    else item.otherAbsenceMinutes += minutes;
  }

  private fallbackAbsenceMinutes(
    absence: StaffAbsenceDocument,
    period: ReportPeriod,
  ): number {
    const start = this.maxDate(absence.startDate, period.start);
    const end = this.minDate(absence.endDate, period.end);
    const rawMinutes = this.overlapMinutes(start, end, start, end);
    if (absence.startTime || absence.endTime) return rawMinutes;
    const days = Math.max(1, this.calendarDaySpan(start, end));
    return days * 8 * 60;
  }

  private calendarDaySpan(start: Date, end: Date): number {
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    return (
      Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000) + 1
    );
  }

  private overlapMinutes(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date,
  ): number {
    const start = this.maxDate(startA, startB);
    const end = this.minDate(endA, endB);
    if (end.getTime() <= start.getTime()) return 0;
    return this.minutesBetween(start, end);
  }

  private minDate(a: Date, b: Date): Date {
    return a.getTime() <= b.getTime() ? a : b;
  }

  private maxDate(a: Date, b: Date): Date {
    return a.getTime() >= b.getTime() ? a : b;
  }

  private sumReportItems(items: WorktimeReportItem[]): WorktimeReportTotals {
    return items.reduce(
      (summary, item) => ({
        plannedMinutes: summary.plannedMinutes + item.plannedMinutes,
        grossMinutes: summary.grossMinutes + item.grossMinutes,
        breakMinutes: summary.breakMinutes + item.breakMinutes,
        netMinutes: summary.netMinutes + item.netMinutes,
        vacationMinutes: summary.vacationMinutes + item.vacationMinutes,
        sickMinutes: summary.sickMinutes + item.sickMinutes,
        unpaidMinutes: summary.unpaidMinutes + item.unpaidMinutes,
        otherAbsenceMinutes:
          summary.otherAbsenceMinutes + item.otherAbsenceMinutes,
        varianceMinutes: summary.varianceMinutes + item.varianceMinutes,
      }),
      {
        plannedMinutes: 0,
        grossMinutes: 0,
        breakMinutes: 0,
        netMinutes: 0,
        vacationMinutes: 0,
        sickMinutes: 0,
        unpaidMinutes: 0,
        otherAbsenceMinutes: 0,
        varianceMinutes: 0,
      },
    );
  }

  private sortReportItems(
    a: WorktimeReportItem,
    b: WorktimeReportItem,
    groupBy: WorktimeReportGroupBy,
  ): number {
    if (groupBy === 'day') return (a.date ?? '').localeCompare(b.date ?? '');
    if (groupBy === 'location') {
      return (a.locationName ?? a.locationId ?? '').localeCompare(
        b.locationName ?? b.locationId ?? '',
      );
    }
    return (a.employeeName ?? a.employeeId ?? '').localeCompare(
      b.employeeName ?? b.employeeId ?? '',
    );
  }

  private dateKey(value: Date | string): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private getAbsenceEmployeeId(absence: StaffAbsenceDocument): string {
    return absence.employeeId ?? absence.userId;
  }

  private async assertCanAccessEmployee(
    actor: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    if (actor.sub === employeeId) {
      return;
    }

    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    if (!(await this.accessPolicy.canManageUser(actor, employee))) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }
  }

  private async assertCanUseLocation(
    actor: AuthenticatedUser,
    locationId: string,
    employeeOrId: UserDocument | string,
  ): Promise<LocationDocument> {
    this.validateObjectId(locationId);
    const employee =
      typeof employeeOrId === 'string'
        ? await this.getEmployeeOrThrow(employeeOrId)
        : employeeOrId;
    const location = await this.locationModel.findById(locationId).exec();

    if (!location) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    const tenantId = this.resolveActorTenantId(actor);
    if (
      (employee.tenantId && employee.tenantId !== tenantId) ||
      (location.tenantId && location.tenantId !== tenantId)
    ) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    const legacyLocationIds = this.getUserLocationIds(employee);
    const assignment = await this.assignmentModel
      .findOne({
        tenantId,
        userId: employee._id.toString(),
        locationId,
      })
      .exec();

    if (!legacyLocationIds.includes(locationId) && !assignment) {
      throw new BadRequestException(
        'Mitarbeiter ist dieser Filiale nicht zugewiesen',
      );
    }

    await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    return location;
  }

  private getUserLocationIds(user: UserDocument): string[] {
    return [
      ...new Set([
        ...(user.locationIds ?? []),
        ...(user.locationId ? [user.locationId] : []),
      ]),
    ];
  }

  private async getEmployeeOrThrow(employeeId: string): Promise<UserDocument> {
    this.validateObjectId(employeeId);
    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    if (!employee.isActive || employee.status === 'disabled') {
      throw new BadRequestException('Mitarbeiter ist nicht aktiv');
    }

    return employee;
  }

  private assertTenantUser(actor: AuthenticatedUser): void {
    if (this.accessPolicy.isPlatformAdmin(actor) || !actor.tenantId) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }
  }

  private resolveActorTenantId(actor: AuthenticatedUser): string {
    this.assertTenantUser(actor);
    return actor.tenantId as string;
  }

  private async assertShiftMatchesEmployee(payload: {
    actor: AuthenticatedUser;
    shiftId: string;
    employeeId: string;
    locationId: string;
    tenantId: string;
  }): Promise<void> {
    this.validateObjectId(payload.shiftId);
    const shift = await this.shiftModel.findById(payload.shiftId).exec();

    if (!shift) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    if (
      shift.tenantId !== payload.tenantId ||
      shift.locationId !== payload.locationId ||
      !shift.assignedUserIds.includes(payload.employeeId)
    ) {
      throw new BadRequestException(
        'Schicht passt nicht zu Mitarbeiter oder Standort',
      );
    }

    await this.accessPolicy.assertCanAccessLocation(
      payload.actor,
      shift.locationId,
    );
  }

  private async assertEmployeeIsNotAbsent(
    actor: AuthenticatedUser,
    employeeId: string,
    at: Date,
  ): Promise<void> {
    const absence = await this.absenceModel
      .findOne({
        tenantId: actor.tenantId,
        $or: [{ employeeId }, { userId: employeeId }],
        type: { $in: [StaffAbsenceType.Vacation, StaffAbsenceType.Sick] },
        status: StaffAbsenceStatus.Approved,
        startDate: { $lte: at },
        endDate: { $gte: at },
      })
      .exec();

    if (absence) {
      throw new BadRequestException('Employee is absent for this period.');
    }
  }

  private applyDateAndStatusFilters(
    query: Record<string, unknown>,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      status?: TimeEntryStatus;
    },
  ): Record<string, unknown> {
    const clockInFilter: Record<string, Date> = {};

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (Number.isNaN(from.getTime())) {
        throw new BadRequestException('Ungueltiges Startdatum');
      }
      clockInFilter.$gte = from;
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (Number.isNaN(to.getTime())) {
        throw new BadRequestException('Ungueltiges Enddatum');
      }
      clockInFilter.$lte = to;
    }

    if (Object.keys(clockInFilter).length) {
      query.clockIn = clockInFilter;
    }

    if (filters.status) {
      if (!Object.values(TimeEntryStatus).includes(filters.status)) {
        throw new BadRequestException('Ungueltiger Zeiterfassungsstatus');
      }
      query.status = filters.status;
    }

    return query;
  }

  private async getEntryOrThrow(id: string): Promise<TimeEntryDocument> {
    this.validateObjectId(id);
    const entry = await this.timeEntryModel.findById(id).exec();

    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    return entry;
  }

  private async getEntryForOwnBreak(
    timeEntryId: string,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    this.assertTenantUser(actor);
    const entry = await this.getEntryOrThrow(timeEntryId);

    if (entry.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    if (entry.employeeId !== actor.sub) {
      throw new ForbiddenException('Pausen koennen nur fuer eigene Zeiten erfasst werden');
    }

    if (entry.status !== TimeEntryStatus.Open || entry.clockOut) {
      throw new BadRequestException('Pausen sind nur fuer offene Zeiteintraege moeglich');
    }

    return entry;
  }

  private async findOpenBreak(
    entry: TimeEntryDocument,
  ): Promise<TimeEntryBreakDocument | null> {
    return this.timeEntryBreakModel
      .findOne({
        tenantId: entry.tenantId,
        timeEntryId: entry._id.toString(),
        breakEndAt: { $exists: false },
      })
      .exec();
  }

  private async refreshBreakMinutes(entry: TimeEntryDocument): Promise<void> {
    const breaks = await this.timeEntryBreakModel
      .find({
        tenantId: entry.tenantId,
        timeEntryId: entry._id.toString(),
        breakEndAt: { $exists: true },
      })
      .exec();

    entry.breakMinutes = breaks.reduce(
      (sum, pause) => sum + (pause.durationMinutes ?? 0),
      0,
    );
    this.recalculateEntryDurations(entry);
    await entry.save();
  }

  private recalculateEntryDurations(entry: TimeEntryDocument): void {
    if (!entry.clockOut) {
      entry.durationMinutes = undefined;
      entry.netDurationMinutes = undefined;
      return;
    }

    const grossMinutes = this.minutesBetween(entry.clockIn, entry.clockOut);
    const breakMinutes = entry.breakMinutes ?? 0;

    if (breakMinutes > grossMinutes) {
      throw new BadRequestException(
        'Pausenzeit darf nicht groesser als Arbeitszeit sein',
      );
    }

    entry.durationMinutes = grossMinutes;
    entry.netDurationMinutes = Math.max(0, grossMinutes - breakMinutes);
  }

  private getDurationPatch(
    clockIn: Date,
    clockOut: Date,
    breakMinutes = 0,
  ): Record<string, unknown> {
    this.assertCorrectedRange(clockIn, clockOut, breakMinutes);
    const grossMinutes = this.minutesBetween(clockIn, clockOut);
    return {
      status: TimeEntryStatus.Corrected,
      durationMinutes: grossMinutes,
      netDurationMinutes: Math.max(0, grossMinutes - breakMinutes),
    };
  }

  private assertCorrectedRange(
    clockIn: Date,
    clockOut: Date | undefined,
    breakMinutes: number,
  ): void {
    if (Number.isNaN(clockIn.getTime())) {
      throw new BadRequestException('Ungueltiger Arbeitsbeginn');
    }

    if (!clockOut) {
      return;
    }

    if (Number.isNaN(clockOut.getTime())) {
      throw new BadRequestException('Ungueltiges Arbeitsende');
    }

    if (clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException('Arbeitsende muss nach Arbeitsbeginn liegen');
    }

    const grossMinutes = this.minutesBetween(clockIn, clockOut);
    if (breakMinutes > grossMinutes) {
      throw new BadRequestException(
        'Pausenzeit darf nicht groesser als Arbeitszeit sein',
      );
    }
  }

  private minutesBetween(start: Date, end: Date): number {
    return Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 60000),
    );
  }

  private async assertCanCorrectEntry(
    actor: AuthenticatedUser,
    entry: TimeEntryDocument,
  ): Promise<void> {
    this.assertTenantUser(actor);

    if (entry.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    if (entry.status === TimeEntryStatus.Open || !entry.clockOut) {
      throw new BadRequestException(
        'Nur geschlossene Zeiteintraege koennen korrigiert werden',
      );
    }

    if (this.accessPolicy.isCompanyAdmin(actor)) {
      return;
    }

    if (
      this.accessPolicy.isScopedLocationManager(actor) ||
      this.accessPolicy.isManagementRole(actor)
    ) {
      await this.accessPolicy.assertCanManageLocation(actor, entry.locationId);
      return;
    }

    throw new ForbiddenException('Nicht ausreichende Berechtigung');
  }

  private snapshotTimeEntry(entry: TimeEntryDocument): Record<string, unknown> {
    return {
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      breakMinutes: entry.breakMinutes,
      durationMinutes: entry.durationMinutes,
      netDurationMinutes: entry.netDurationMinutes,
      notes: entry.notes ?? entry.note,
      status: entry.status,
    };
  }

  private async auditTimeEntryCorrection(
    actor: AuthenticatedUser,
    entry: TimeEntryDocument,
    oldValues: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogModel.create({
      actorUserId: actor.sub,
      actorRole: actor.roles?.[0] ?? 'unknown',
      tenantId: entry.tenantId,
      action: 'time_entry_corrected',
      entityType: 'time_entry',
      entityId: entry._id.toString(),
      metadata: {
        locationId: entry.locationId,
        employeeId: entry.employeeId,
        oldValues,
        newValues: this.snapshotTimeEntry(entry),
        correctionReason: entry.correctionReason,
      },
    });
  }

  private async getCorrectionOrThrow(
    id: string,
  ): Promise<TimeCorrectionDocument> {
    this.validateObjectId(id);
    const correction = await this.correctionModel.findById(id).exec();
    if (!correction) {
      throw new NotFoundException('Korrekturantrag nicht gefunden');
    }
    return correction;
  }

  private assertCanManageTimeCorrections(actor: AuthenticatedUser): void {
    if (!this.accessPolicy.isManagementRole(actor)) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer Zeiterfassungs-Korrekturen',
      );
    }
  }

  private assertCorrectionRange(
    payload: CreateTimeCorrectionDto,
    entry: TimeEntryDocument,
  ): void {
    const clockIn = payload.requestedClockIn
      ? new Date(payload.requestedClockIn)
      : entry.clockIn;
    const clockOut = payload.requestedClockOut
      ? new Date(payload.requestedClockOut)
      : entry.clockOut;

    if (clockOut && clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException(
        'Korrigiertes Arbeitsende muss nach Arbeitsbeginn liegen',
      );
    }
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige ID');
    }
  }
}
