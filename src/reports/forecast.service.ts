import {
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
import {
  Order,
  OrderDocument,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  StaffShift,
  StaffShiftDocument,
  StaffShiftStatus,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  TimeEntry,
  TimeEntryDocument,
  TimeEntryStatus,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateForecastEventDto,
  ForecastEventQueryDto,
  UpdateForecastEventDto,
} from './dto/forecast-event.dto';
import { ForecastQueryDto } from './dto/forecast-query.dto';
import {
  ForecastEvent,
  ForecastEventDocument,
} from './schemas/forecast-event.schema';
import {
  ForecastSnapshot,
  ForecastSnapshotDocument,
} from './schemas/forecast-snapshot.schema';

type ForecastConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
type StaffingWarningType =
  | 'UNDERSTAFFED'
  | 'OVERSTAFFED'
  | 'LOW_FORECAST_CONFIDENCE';
type StaffingWarningSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

interface ForecastPeriod {
  mode: 'week' | 'month';
  start: Date;
  end: Date;
  dateFrom: string;
  dateTo: string;
  week?: number;
  year: number;
  month?: number;
}

interface ForecastScope {
  tenantId: string;
  period: ForecastPeriod;
  locationIds: string[];
  locations: Array<LocationDocument | (Location & { _id: unknown })>;
}

interface RevenueOrder {
  locationId: string;
  total: number;
  refundTotal?: number;
  createdAt?: Date;
}

interface ForecastTimeEntry {
  employeeId: string;
  locationId: string;
  netDurationMinutes?: number;
  durationMinutes?: number;
  breakMinutes?: number;
  clockIn: Date;
}

interface ForecastShift {
  locationId: string;
  departmentId?: string;
  startTime: Date;
  endTime: Date;
  assignedUserIds?: string[];
  requiredStaffCount?: number;
  status: StaffShiftStatus;
}

interface ForecastDay {
  date: string;
  index: number;
  forecastRevenue: number;
  sampleCount: number;
}

interface ForecastEventLean {
  _id: unknown;
  tenantId: string;
  locationId: string;
  title: string;
  date: Date;
  impactPercent: number;
  note?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ForecastAccuracyMetrics {
  accuracy: number | null;
  snapshotCount: number;
  seasonalFactor: number;
  holidayFactor: number;
  eventFactor: number;
}

interface LocationAccumulator {
  id: string;
  name: string;
  forecastRevenue: number;
  forecastHours: number;
  plannedHours: number;
  expectedLaborCost: number;
  confidence: ForecastConfidence;
}

interface DepartmentAccumulator {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  forecastHours: number;
  plannedHours: number;
}

export interface StaffingWarning {
  type: StaffingWarningType;
  severity: StaffingWarningSeverity;
  message: string;
  locationId: string;
  locationName: string;
  departmentId?: string;
  departmentName?: string;
  requiredHours: number;
  plannedHours: number;
  varianceHours: number;
  date?: string;
}

@Injectable()
export class ForecastService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(StaffShift.name)
    private readonly shiftModel: Model<StaffShiftDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(ForecastEvent.name)
    private readonly forecastEventModel: Model<ForecastEventDocument>,
    @InjectModel(ForecastSnapshot.name)
    private readonly forecastSnapshotModel: Model<ForecastSnapshotDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getForecast(actor: AuthenticatedUser, query: ForecastQueryDto) {
    this.assertCanViewForecast(actor);
    const scope = await this.resolveScope(actor, query);
    const historyStart = this.addDays(scope.period.start, -28);
    const previousPeriodStart = this.addDays(
      scope.period.start,
      -this.periodDays(scope.period),
    );
    const seasonHistoryStart = this.addDays(scope.period.start, -365);
    const historyQueryStart = [
      previousPeriodStart,
      historyStart,
      seasonHistoryStart,
    ].reduce((earliest, date) => (date < earliest ? date : earliest));

    const [orders, entries, shifts, departments, events] = await Promise.all([
      this.findRevenueOrders(scope, historyQueryStart, scope.period.start),
      this.findTimeEntries(scope, historyStart, scope.period.start),
      this.findShifts(scope, historyStart, scope.period.end),
      this.departmentModel
        .find({ tenantId: scope.tenantId })
        .select('_id name')
        .lean(),
      this.findForecastEvents(scope, scope.period.start, scope.period.end),
    ]);
    const users = await this.findUsersForEntries(scope.tenantId, entries);

    const departmentById = new Map(
      departments.map((department) => [
        this.stringifyId(department._id),
        department.name,
      ]),
    );
    const revenueByLocationDay = this.groupRevenueByLocationDay(orders);
    const historicalHoursByLocation = this.sumHoursByLocation(entries);
    const historicalRevenueByLocation = this.sumRevenueByLocation(orders);
    const averageHourlyRateByLocation = this.averageHourlyRateByLocation(
      entries,
      users,
    );
    const plannedHoursByLocation = this.plannedHoursByLocation(
      shifts,
      scope.period.start,
      scope.period.end,
    );
    const departmentShares = this.departmentShares(
      shifts,
      historyStart,
      scope.period.start,
    );
    const plannedDepartmentHours = this.plannedDepartmentHours(
      shifts,
      scope.period.start,
      scope.period.end,
    );

    const targetDays = this.daysBetween(scope.period.start, scope.period.end);
    const locationRows: LocationAccumulator[] = [];
    const departmentRows: DepartmentAccumulator[] = [];

    for (const location of scope.locations) {
      const locationId = this.stringifyId(location._id);
      const locationName = location.name;
      const forecastDays = targetDays.map((day, index) =>
        this.forecastDayRevenue({
          day,
          index,
          periodDays: targetDays.length,
          locationId,
          revenueByLocationDay,
          periodStart: scope.period.start,
        }),
      );
      const seasonalFactor = this.seasonalFactorForLocation(
        locationId,
        scope.period.start.getUTCMonth(),
        revenueByLocationDay,
      );
      const holidayFactor = this.holidayFactorForLocation(targetDays, location);
      const eventFactor = this.eventFactorForLocation(events, locationId);
      const adjustmentFactor = seasonalFactor * holidayFactor * eventFactor;
      const forecastRevenue = this.roundMoney(
        forecastDays.reduce((sum, day) => sum + day.forecastRevenue, 0) *
          adjustmentFactor,
      );
      const historyRevenue = historicalRevenueByLocation.get(locationId) ?? 0;
      const historyHours = historicalHoursByLocation.get(locationId) ?? 0;
      const revenuePerHour = historyHours > 0 ? historyRevenue / historyHours : 0;
      const forecastHours = revenuePerHour > 0 ? forecastRevenue / revenuePerHour : 0;
      const averageHourlyRate = averageHourlyRateByLocation.get(locationId) ?? 0;
      const plannedHours = plannedHoursByLocation.get(locationId) ?? 0;
      const confidence = this.locationConfidence(forecastDays, revenuePerHour);
      locationRows.push({
        id: locationId,
        name: locationName,
        forecastRevenue,
        forecastHours: this.roundHours(forecastHours),
        plannedHours: this.roundHours(plannedHours),
        expectedLaborCost: this.roundMoney(forecastHours * averageHourlyRate),
        confidence,
      });

      const shares = departmentShares.get(locationId) ?? new Map<string, number>();
      for (const [departmentId, share] of shares) {
        const forecastDepartmentHours = forecastHours * share;
        departmentRows.push({
          id: departmentId,
          name: departmentById.get(departmentId) ?? departmentId,
          locationId,
          locationName,
          forecastHours: this.roundHours(forecastDepartmentHours),
          plannedHours: this.roundHours(
            plannedDepartmentHours.get(`${locationId}:${departmentId}`) ?? 0,
          ),
        });
      }
    }

    const locations = locationRows.map((row) => ({
      ...row,
      varianceHours: this.roundHours(row.plannedHours - row.forecastHours),
      staffingWarning: this.warningForLocation(row),
    }));
    const departmentsResponse = departmentRows.map((row) => ({
      ...row,
      missingHours: this.roundHours(Math.max(0, row.forecastHours - row.plannedHours)),
      varianceHours: this.roundHours(row.plannedHours - row.forecastHours),
      staffingWarning: this.warningForDepartment(row),
    }));
    const staffingWarnings = [
      ...locations.map((row) => row.staffingWarning),
      ...departmentsResponse.map((row) => row.staffingWarning),
    ].filter((warning): warning is StaffingWarning => Boolean(warning));

    const forecastRevenue = this.roundMoney(
      locations.reduce((sum, row) => sum + row.forecastRevenue, 0),
    );
    const forecastHours = this.roundHours(
      locations.reduce((sum, row) => sum + row.forecastHours, 0),
    );
    const plannedHours = this.roundHours(
      locations.reduce((sum, row) => sum + row.plannedHours, 0),
    );
    const expectedLaborCost = this.roundMoney(
      locations.reduce((sum, row) => sum + row.expectedLaborCost, 0),
    );
    const accuracyMetrics = await this.forecastAccuracyMetrics(
      scope,
      revenueByLocationDay,
      events,
      targetDays,
    );
    if (accuracyMetrics.accuracy !== null && accuracyMetrics.accuracy < 70) {
      staffingWarnings.push({
        type: 'LOW_FORECAST_CONFIDENCE',
        severity: accuracyMetrics.accuracy < 50 ? 'CRITICAL' : 'WARNING',
        message: `Forecast-Genauigkeit liegt nur bei ${accuracyMetrics.accuracy}%.`,
        locationId: scope.locationIds[0] ?? '',
        locationName: scope.locations[0]?.name ?? 'Forecast',
        requiredHours: forecastHours,
        plannedHours,
        varianceHours: this.roundHours(plannedHours - forecastHours),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      formula:
        'Basis: 50% Durchschnitt letzte 28 Tage + 30% gleiche Wochentage + 20% Vorzeitraum. Danach Korrektur mit Saisonfaktor, Feiertagsfaktor und aktiven Eventfaktoren.',
      period: {
        mode: scope.period.mode,
        dateFrom: scope.period.dateFrom,
        dateTo: scope.period.dateTo,
        week: scope.period.week,
        year: scope.period.year,
        month: scope.period.month,
      },
      forecastRevenue,
      forecastHours,
      plannedHours,
      varianceHours: this.roundHours(plannedHours - forecastHours),
      expectedLaborCost,
      confidence: this.combinedConfidence(locations),
      accuracy: accuracyMetrics.accuracy,
      accuracySnapshotCount: accuracyMetrics.snapshotCount,
      seasonalFactor: accuracyMetrics.seasonalFactor,
      holidayFactor: accuracyMetrics.holidayFactor,
      eventFactor: accuracyMetrics.eventFactor,
      staffingWarnings,
      locations,
      departments: departmentsResponse,
    };
  }

  async getForecastEvents(
    actor: AuthenticatedUser,
    query: ForecastEventQueryDto,
  ) {
    this.assertCanViewForecast(actor);
    const scope = await this.resolveScope(actor, query);
    const range = this.eventDateRange(scope.period);
    const filter: Record<string, unknown> = {
      tenantId: scope.tenantId,
      locationId: { $in: scope.locationIds },
      date: { $gte: range.start, $lt: range.end },
    };
    if (query.active !== undefined) filter.active = query.active;
    return this.forecastEventModel
      .find(filter)
      .sort({ date: 1, title: 1 })
      .lean();
  }

  async createForecastEvent(
    actor: AuthenticatedUser,
    dto: CreateForecastEventDto,
  ) {
    this.assertCanViewForecast(actor);
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine Forecast Events pflegen');
    }
    await this.accessPolicy.assertCanAccessLocation(actor, dto.locationId);
    const location = await this.locationModel
      .findOne({ tenantId: actor.tenantId, _id: dto.locationId })
      .select('_id companyId')
      .lean();
    if (!location) throw new NotFoundException('Standort nicht gefunden');
    return this.forecastEventModel.create({
      tenantId: actor.tenantId,
      companyId: location.companyId,
      locationId: dto.locationId,
      title: dto.title.trim(),
      date: this.startOfUtcDay(new Date(dto.date)),
      impactPercent: dto.impactPercent,
      note: dto.note?.trim(),
      active: true,
      createdByUserId: actor.sub,
    });
  }

  async updateForecastEvent(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateForecastEventDto,
  ) {
    this.assertCanViewForecast(actor);
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine Forecast Events pflegen');
    }
    const event = await this.forecastEventModel
      .findOne({ _id: id, tenantId: actor.tenantId })
      .lean();
    if (!event) throw new NotFoundException('Forecast Event nicht gefunden');
    const nextLocationId = dto.locationId ?? event.locationId;
    await this.accessPolicy.assertCanAccessLocation(actor, nextLocationId);
    const update: Record<string, unknown> = {};
    if (dto.locationId !== undefined) update.locationId = dto.locationId;
    if (dto.title !== undefined) update.title = dto.title.trim();
    if (dto.date !== undefined) update.date = this.startOfUtcDay(new Date(dto.date));
    if (dto.impactPercent !== undefined) update.impactPercent = dto.impactPercent;
    if (dto.note !== undefined) update.note = dto.note.trim();
    if (dto.active !== undefined) update.active = dto.active;
    const updated = await this.forecastEventModel
      .findOneAndUpdate({ _id: id, tenantId: actor.tenantId }, update, {
        new: true,
      })
      .lean();
    if (!updated) throw new NotFoundException('Forecast Event nicht gefunden');
    return updated;
  }

  async deleteForecastEvent(actor: AuthenticatedUser, id: string) {
    this.assertCanViewForecast(actor);
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine Forecast Events pflegen');
    }
    const event = await this.forecastEventModel
      .findOne({ _id: id, tenantId: actor.tenantId })
      .lean();
    if (!event) throw new NotFoundException('Forecast Event nicht gefunden');
    await this.accessPolicy.assertCanAccessLocation(actor, event.locationId);
    const updated = await this.forecastEventModel
      .findOneAndUpdate(
        { _id: id, tenantId: actor.tenantId },
        { active: false },
        { new: true },
      )
      .lean();
    return updated;
  }

  async getForecastAccuracy(actor: AuthenticatedUser, query: ForecastQueryDto) {
    this.assertCanViewForecast(actor);
    const scope = await this.resolveScope(actor, query);
    const historyStart = this.addDays(scope.period.start, -365);
    const [orders, events] = await Promise.all([
      this.findRevenueOrders(scope, historyStart, scope.period.start),
      this.findForecastEvents(scope, scope.period.start, scope.period.end),
    ]);
    const metrics = await this.forecastAccuracyMetrics(
      scope,
      this.groupRevenueByLocationDay(orders),
      events,
      this.daysBetween(scope.period.start, scope.period.end),
    );
    return {
      ...metrics,
      warning:
        metrics.accuracy !== null && metrics.accuracy < 70
          ? {
              type: 'LOW_FORECAST_CONFIDENCE',
              severity: metrics.accuracy < 50 ? 'CRITICAL' : 'WARNING',
              message: `Forecast-Genauigkeit liegt nur bei ${metrics.accuracy}%.`,
            }
          : undefined,
    };
  }

  private async resolveScope(
    actor: AuthenticatedUser,
    query: ForecastQueryDto,
  ): Promise<ForecastScope> {
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine operativen Forecasts nutzen');
    }
    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    }
    const readableLocationIds = await this.accessPolicy.getReadableLocationIds(actor);
    const locationIds = query.locationId ? [query.locationId] : readableLocationIds;
    const locations = await this.locationModel
      .find({
        tenantId: actor.tenantId,
        _id: { $in: locationIds },
        isActive: { $ne: false },
      })
      .select('_id name companyId federalState regionId city')
      .lean();
    return {
      tenantId: actor.tenantId,
      period: this.resolvePeriod(query),
      locationIds: locations.map((location) => this.stringifyId(location._id)),
      locations,
    };
  }

  private findRevenueOrders(scope: ForecastScope, from: Date, to: Date) {
    return this.orderModel
      .find({
        tenantId: scope.tenantId,
        locationId: { $in: scope.locationIds },
        paymentStatus: PaymentStatus.Paid,
        status: { $ne: OrderStatus.Cancelled },
        createdAt: { $gte: from, $lt: to },
      })
      .lean() as unknown as Promise<RevenueOrder[]>;
  }

  private findTimeEntries(scope: ForecastScope, from: Date, to: Date) {
    return this.timeEntryModel
      .find({
        tenantId: scope.tenantId,
        locationId: { $in: scope.locationIds },
        status: { $in: [TimeEntryStatus.Closed, TimeEntryStatus.Corrected] },
        clockIn: { $gte: from, $lt: to },
      })
      .lean() as unknown as Promise<ForecastTimeEntry[]>;
  }

  private findShifts(scope: ForecastScope, from: Date, to: Date) {
    return this.shiftModel
      .find({
        tenantId: scope.tenantId,
        locationId: { $in: scope.locationIds },
        status: { $ne: StaffShiftStatus.Cancelled },
        startTime: { $gte: from, $lt: to },
      })
      .lean() as unknown as Promise<ForecastShift[]>;
  }

  private findForecastEvents(scope: ForecastScope, from: Date, to: Date) {
    return this.forecastEventModel
      .find({
        tenantId: scope.tenantId,
        locationId: { $in: scope.locationIds },
        active: true,
        date: { $gte: this.startOfUtcDay(from), $lt: this.startOfUtcDay(to) },
      })
      .lean() as unknown as Promise<ForecastEventLean[]>;
  }

  private async findUsersForEntries(
    tenantId: string,
    entries: ForecastTimeEntry[],
  ) {
    const ids = [...new Set(entries.map((entry) => entry.employeeId))];
    if (!ids.length) return new Map<string, User>();
    const users = await this.userModel
      .find({ tenantId, _id: { $in: ids } })
      .select('_id hourlyRate')
      .lean();
    return new Map(users.map((user) => [this.stringifyId(user._id), user]));
  }

  private forecastDayRevenue(options: {
    day: Date;
    index: number;
    periodDays: number;
    locationId: string;
    revenueByLocationDay: Map<string, number>;
    periodStart: Date;
  }) {
    const { day, index, periodDays, locationId, revenueByLocationDay, periodStart } = options;
    const last28Values = Array.from({ length: 28 }, (_, offset) =>
      revenueByLocationDay.get(this.locationDayKey(locationId, this.addDays(periodStart, -28 + offset))) ?? 0,
    );
    const sameWeekdayValues = [7, 14, 21, 28].map(
      (offset) =>
        revenueByLocationDay.get(this.locationDayKey(locationId, this.addDays(day, -offset))) ?? 0,
    );
    const previousPeriodValue =
      revenueByLocationDay.get(
        this.locationDayKey(locationId, this.addDays(day, -periodDays)),
      ) ?? 0;
    const last4WeekAverage = this.average(last28Values);
    const sameWeekdayAverage = this.average(sameWeekdayValues);
    const forecastRevenue =
      last4WeekAverage * 0.5 + sameWeekdayAverage * 0.3 + previousPeriodValue * 0.2;
    const sampleCount =
      last28Values.filter((value) => value > 0).length +
      sameWeekdayValues.filter((value) => value > 0).length +
      (previousPeriodValue > 0 ? 1 : 0);
    return {
      date: day.toISOString(),
      index,
      forecastRevenue,
      sampleCount,
    };
  }

  private forecastRevenueForDayFromHistory(
    day: Date,
    locationId: string,
    revenueByLocationDay: Map<string, number>,
  ): ForecastDay {
    const last28Values = Array.from({ length: 28 }, (_, offset) =>
      revenueByLocationDay.get(
        this.locationDayKey(locationId, this.addDays(day, -28 + offset)),
      ) ?? 0,
    );
    const sameWeekdayValues = [7, 14, 21, 28].map(
      (offset) =>
        revenueByLocationDay.get(this.locationDayKey(locationId, this.addDays(day, -offset))) ??
        0,
    );
    const previousPeriodValue =
      revenueByLocationDay.get(this.locationDayKey(locationId, this.addDays(day, -7))) ?? 0;
    const forecastRevenue =
      this.average(last28Values) * 0.5 +
      this.average(sameWeekdayValues) * 0.3 +
      previousPeriodValue * 0.2;
    const sampleCount =
      last28Values.filter((value) => value > 0).length +
      sameWeekdayValues.filter((value) => value > 0).length +
      (previousPeriodValue > 0 ? 1 : 0);
    return {
      date: day.toISOString(),
      index: 0,
      forecastRevenue,
      sampleCount,
    };
  }

  private async forecastAccuracyMetrics(
    scope: ForecastScope,
    revenueByLocationDay: Map<string, number>,
    events: ForecastEventLean[],
    targetDays: Date[],
  ): Promise<ForecastAccuracyMetrics> {
    const snapshotDays = this.daysBetween(
      this.addDays(scope.period.start, -28),
      scope.period.start,
    );
    const snapshots: Array<{
      locationId: string;
      date: Date;
      forecastRevenue: number;
      actualRevenue: number;
      accuracy: number;
      week: number;
      year: number;
    }> = [];
    for (const locationId of scope.locationIds) {
      for (const day of snapshotDays) {
        const actualRevenue =
          revenueByLocationDay.get(this.locationDayKey(locationId, day)) ?? 0;
        const forecastRevenue = this.forecastRevenueForDayFromHistory(
          day,
          locationId,
          revenueByLocationDay,
        ).forecastRevenue;
        if (actualRevenue <= 0 && forecastRevenue <= 0) continue;
        const accuracy = this.forecastAccuracy(forecastRevenue, actualRevenue);
        const weekParts = this.isoWeekParts(day);
        snapshots.push({
          locationId,
          date: this.startOfUtcDay(day),
          forecastRevenue: this.roundMoney(forecastRevenue),
          actualRevenue: this.roundMoney(actualRevenue),
          accuracy,
          week: weekParts.week,
          year: weekParts.year,
        });
      }
    }
    await Promise.all(
      snapshots.map((snapshot) =>
        this.forecastSnapshotModel.updateOne(
          {
            tenantId: scope.tenantId,
            locationId: snapshot.locationId,
            date: snapshot.date,
          },
          {
            $set: {
              ...snapshot,
              tenantId: scope.tenantId,
            },
          },
          { upsert: true },
        ),
      ),
    );
    const accuracy =
      snapshots.length > 0
        ? this.roundHours(this.average(snapshots.map((snapshot) => snapshot.accuracy)))
        : null;
    return {
      accuracy,
      snapshotCount: snapshots.length,
      seasonalFactor: this.roundFactor(
        this.average(
          scope.locationIds.map((locationId) =>
            this.seasonalFactorForLocation(
              locationId,
              scope.period.start.getUTCMonth(),
              revenueByLocationDay,
            ),
          ),
        ) || 1,
      ),
      holidayFactor: this.roundFactor(
        this.average(
          scope.locations.map((location) =>
            this.holidayFactorForLocation(targetDays, location),
          ),
        ) || 1,
      ),
      eventFactor: this.roundFactor(
        this.average(
          scope.locationIds.map((locationId) =>
            this.eventFactorForLocation(events, locationId),
          ),
        ) || 1,
      ),
    };
  }

  private forecastAccuracy(forecastRevenue: number, actualRevenue: number): number {
    if (actualRevenue <= 0) return forecastRevenue <= 0 ? 100 : 0;
    const accuracy = (1 - Math.abs(forecastRevenue - actualRevenue) / actualRevenue) * 100;
    return this.roundHours(Math.max(0, Math.min(100, accuracy)));
  }

  private seasonalFactorForLocation(
    locationId: string,
    targetMonth: number,
    revenueByLocationDay: Map<string, number>,
  ): number {
    const allValues: number[] = [];
    const monthValues: number[] = [];
    for (const [key, value] of revenueByLocationDay.entries()) {
      if (!key.startsWith(`${locationId}:`) || value <= 0) continue;
      const date = new Date(`${key.slice(locationId.length + 1)}T00:00:00Z`);
      allValues.push(value);
      if (date.getUTCMonth() === targetMonth) monthValues.push(value);
    }
    const overallAverage = this.average(allValues);
    const monthAverage = this.average(monthValues);
    if (overallAverage <= 0 || monthAverage <= 0) return 1;
    return this.roundFactor(this.clamp(monthAverage / overallAverage, 0.7, 1.35));
  }

  private holidayFactorForLocation(
    days: Date[],
    location: LocationDocument | (Location & { _id: unknown }),
  ): number {
    const state = this.normalizeState(location.federalState ?? location.regionId ?? '');
    const holidayCount = days.filter((day) => this.isGermanHoliday(day, state)).length;
    if (!holidayCount) return 1;
    return this.roundFactor(1 + Math.min(0.18, holidayCount * 0.04));
  }

  private eventFactorForLocation(
    events: ForecastEventLean[],
    locationId: string,
  ): number {
    const impactPercent = events
      .filter((event) => event.locationId === locationId && event.active)
      .reduce((sum, event) => sum + Number(event.impactPercent ?? 0), 0);
    return this.roundFactor(this.clamp(1 + impactPercent / 100, 0.3, 2.5));
  }

  private groupRevenueByLocationDay(orders: RevenueOrder[]) {
    const result = new Map<string, number>();
    for (const order of orders) {
      const key = this.locationDayKey(order.locationId, new Date(order.createdAt ?? 0));
      result.set(key, (result.get(key) ?? 0) + this.orderRevenue(order));
    }
    return result;
  }

  private sumRevenueByLocation(orders: RevenueOrder[]) {
    const result = new Map<string, number>();
    for (const order of orders) {
      result.set(order.locationId, (result.get(order.locationId) ?? 0) + this.orderRevenue(order));
    }
    return result;
  }

  private sumHoursByLocation(entries: ForecastTimeEntry[]) {
    const result = new Map<string, number>();
    for (const entry of entries) {
      result.set(entry.locationId, (result.get(entry.locationId) ?? 0) + this.entryHours(entry));
    }
    return result;
  }

  private averageHourlyRateByLocation(
    entries: ForecastTimeEntry[],
    users: Map<string, User>,
  ) {
    const totals = new Map<string, { cost: number; hours: number }>();
    for (const entry of entries) {
      const hours = this.entryHours(entry);
      const rate = Number(users.get(entry.employeeId)?.hourlyRate ?? 0);
      const current = totals.get(entry.locationId) ?? { cost: 0, hours: 0 };
      current.cost += hours * rate;
      current.hours += hours;
      totals.set(entry.locationId, current);
    }
    return new Map(
      [...totals.entries()].map(([locationId, value]) => [
        locationId,
        value.hours > 0 ? value.cost / value.hours : 0,
      ]),
    );
  }

  private plannedHoursByLocation(shifts: ForecastShift[], from: Date, to: Date) {
    const result = new Map<string, number>();
    for (const shift of this.shiftsInRange(shifts, from, to)) {
      const hours = this.shiftHours(shift);
      result.set(shift.locationId, (result.get(shift.locationId) ?? 0) + hours);
    }
    return result;
  }

  private plannedDepartmentHours(shifts: ForecastShift[], from: Date, to: Date) {
    const result = new Map<string, number>();
    for (const shift of this.shiftsInRange(shifts, from, to)) {
      if (!shift.departmentId) continue;
      const key = `${shift.locationId}:${shift.departmentId}`;
      result.set(key, (result.get(key) ?? 0) + this.shiftHours(shift));
    }
    return result;
  }

  private departmentShares(shifts: ForecastShift[], from: Date, to: Date) {
    const totals = new Map<string, Map<string, number>>();
    for (const shift of this.shiftsInRange(shifts, from, to)) {
      if (!shift.departmentId) continue;
      const departments = totals.get(shift.locationId) ?? new Map<string, number>();
      departments.set(
        shift.departmentId,
        (departments.get(shift.departmentId) ?? 0) + this.shiftHours(shift),
      );
      totals.set(shift.locationId, departments);
    }
    return new Map(
      [...totals.entries()].map(([locationId, departmentHours]) => {
        const total = [...departmentHours.values()].reduce((sum, value) => sum + value, 0);
        return [
          locationId,
          new Map(
            [...departmentHours.entries()].map(([departmentId, hours]) => [
              departmentId,
              total > 0 ? hours / total : 0,
            ]),
          ),
        ];
      }),
    );
  }

  private warningForLocation(row: LocationAccumulator): StaffingWarning | undefined {
    return this.warningFor({
      locationId: row.id,
      locationName: row.name,
      requiredHours: row.forecastHours,
      plannedHours: row.plannedHours,
    });
  }

  private warningForDepartment(row: DepartmentAccumulator): StaffingWarning | undefined {
    return this.warningFor({
      locationId: row.locationId,
      locationName: row.locationName,
      departmentId: row.id,
      departmentName: row.name,
      requiredHours: row.forecastHours,
      plannedHours: row.plannedHours,
    });
  }

  private warningFor(input: {
    locationId: string;
    locationName: string;
    departmentId?: string;
    departmentName?: string;
    requiredHours: number;
    plannedHours: number;
  }): StaffingWarning | undefined {
    const variance = this.roundHours(input.plannedHours - input.requiredHours);
    if (Math.abs(variance) < 1) return undefined;
    const basis = Math.max(input.requiredHours, 1);
    const severity: StaffingWarningSeverity =
      Math.abs(variance) >= 8 || Math.abs(variance) / basis >= 0.3
        ? 'CRITICAL'
        : Math.abs(variance) >= 4
          ? 'WARNING'
          : 'INFO';
    const label = input.departmentName
      ? `${input.locationName} / ${input.departmentName}`
      : input.locationName;
    if (variance < 0) {
      return {
        type: 'UNDERSTAFFED',
        severity,
        message: `${label}: voraussichtlich ${Math.abs(variance)} Stunden Unterdeckung.`,
        locationId: input.locationId,
        locationName: input.locationName,
        departmentId: input.departmentId,
        departmentName: input.departmentName,
        requiredHours: input.requiredHours,
        plannedHours: input.plannedHours,
        varianceHours: variance,
      };
    }
    return {
      type: 'OVERSTAFFED',
      severity,
      message: `${label}: voraussichtlich ${variance} Stunden Ueberdeckung.`,
      locationId: input.locationId,
      locationName: input.locationName,
      departmentId: input.departmentId,
      departmentName: input.departmentName,
      requiredHours: input.requiredHours,
      plannedHours: input.plannedHours,
      varianceHours: variance,
    };
  }

  private locationConfidence(
    days: { sampleCount: number }[],
    revenuePerHour: number,
  ): ForecastConfidence {
    const avgSamples = this.average(days.map((day) => day.sampleCount));
    if (revenuePerHour > 0 && avgSamples >= 20) return 'HIGH';
    if (revenuePerHour > 0 && avgSamples >= 8) return 'MEDIUM';
    return 'LOW';
  }

  private combinedConfidence(rows: { confidence: ForecastConfidence }[]): ForecastConfidence {
    if (!rows.length) return 'LOW';
    if (rows.every((row) => row.confidence === 'HIGH')) return 'HIGH';
    if (rows.some((row) => row.confidence !== 'LOW')) return 'MEDIUM';
    return 'LOW';
  }

  private shiftsInRange(shifts: ForecastShift[], from: Date, to: Date) {
    return shifts.filter((shift) => {
      const start = new Date(shift.startTime);
      return start >= from && start < to && shift.status !== StaffShiftStatus.Cancelled;
    });
  }

  private shiftHours(shift: ForecastShift): number {
    const start = new Date(shift.startTime).getTime();
    const end = new Date(shift.endTime).getTime();
    const duration = Math.max(0, end - start) / 3600000;
    const assignedCount = shift.assignedUserIds?.length ?? 0;
    const staffCount = Math.max(assignedCount, Number(shift.requiredStaffCount ?? 1));
    return duration * staffCount;
  }

  private entryHours(entry: {
    netDurationMinutes?: number;
    durationMinutes?: number;
    breakMinutes?: number;
  }): number {
    const minutes =
      entry.netDurationMinutes ??
      Math.max(0, Number(entry.durationMinutes ?? 0) - Number(entry.breakMinutes ?? 0));
    return minutes / 60;
  }

  private orderRevenue(order: { total?: number; refundTotal?: number }): number {
    return Math.max(0, Number(order.total ?? 0) - Number(order.refundTotal ?? 0));
  }

  private resolvePeriod(query: ForecastQueryDto): ForecastPeriod {
    const year = query.year ?? new Date().getUTCFullYear();
    if (query.month) {
      const start = new Date(Date.UTC(year, query.month - 1, 1));
      const end = new Date(Date.UTC(year, query.month, 1));
      return {
        mode: 'month',
        start,
        end,
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        month: query.month,
        year,
      };
    }
    const week = query.week ?? this.isoWeekParts(new Date()).week;
    const weekYear = query.year ?? this.isoWeekParts(new Date()).year;
    const { start, end } = this.weekDateRange(week, weekYear);
    return {
      mode: 'week',
      start,
      end,
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      week,
      year: weekYear,
    };
  }

  private periodDays(period: ForecastPeriod): number {
    return this.daysBetween(period.start, period.end).length;
  }

  private eventDateRange(period: ForecastPeriod): { start: Date; end: Date } {
    return {
      start: this.addDays(period.start, -31),
      end: this.addDays(period.end, 31),
    };
  }

  private daysBetween(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
      days.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
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

  private isoWeekParts(date: Date): { week: number; year: number } {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return {
      week: Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7),
      year: target.getUTCFullYear(),
    };
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private locationDayKey(locationId: string, date: Date): string {
    return `${locationId}:${date.toISOString().slice(0, 10)}`;
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private isGermanHoliday(date: Date, state: string): boolean {
    const day = this.startOfUtcDay(date);
    const month = day.getUTCMonth() + 1;
    const dayOfMonth = day.getUTCDate();
    const fixed = `${month}-${dayOfMonth}`;
    if (['1-1', '5-1', '10-3', '12-25', '12-26'].includes(fixed)) return true;
    if (state === 'BY' && ['1-6', '8-15', '11-1'].includes(fixed)) return true;
    if (state === 'BW' && ['1-6', '11-1'].includes(fixed)) return true;
    if (['NW', 'RP', 'SL'].includes(state) && fixed === '11-1') return true;
    const easter = this.easterSunday(day.getUTCFullYear());
    const movableOffsets = [-2, 1, 39, 50];
    return movableOffsets.some((offset) => {
      const movable = this.addDays(easter, offset);
      return movable.toISOString().slice(0, 10) === day.toISOString().slice(0, 10);
    });
  }

  private easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private normalizeState(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized.includes('bayern') || normalized === 'by') return 'BY';
    if (normalized.includes('baden') || normalized === 'bw') return 'BW';
    if (normalized.includes('nordrhein') || normalized === 'nw' || normalized === 'nrw') {
      return 'NW';
    }
    if (normalized.includes('rheinland') || normalized === 'rp') return 'RP';
    if (normalized.includes('saar') || normalized === 'sl') return 'SL';
    return normalized.toUpperCase();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private assertCanViewForecast(user: AuthenticatedUser): void {
    if (
      !hasAnyRole(user.roles, [
        Role.TenantAdminCode,
        Role.TenantAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        Role.Personalabteilung,
        Role.Buchhaltung,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer Forecasts');
    }
  }

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Types.ObjectId) return value.toHexString();
    if (
      typeof value === 'object' &&
      value !== null &&
      value.toString !== Object.prototype.toString
    ) {
      return (value as { toString: () => string }).toString();
    }
    return '';
  }

  private roundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundFactor(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
