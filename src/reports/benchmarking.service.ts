import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { Role } from '../auth/enums/role.enum';
import { hasAnyRole } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
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
import { Region, RegionDocument } from '../regions/schemas/region.schema';
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
import { BenchmarkingQueryDto } from './dto/benchmarking-query.dto';
import {
  ForecastSnapshot,
  ForecastSnapshotDocument,
} from './schemas/forecast-snapshot.schema';

type BenchmarkPeriodMode = 'week' | 'month' | 'quarter' | 'year';
type BenchmarkBadge = 'TOP_PERFORMER' | 'AVERAGE' | 'NEEDS_ATTENTION';

interface BenchmarkPeriod {
  mode: BenchmarkPeriodMode;
  from: Date;
  to: Date;
  dateFrom: string;
  dateTo: string;
  week?: number;
  month?: number;
  quarter?: number;
  year: number;
  days: number;
}

interface BenchmarkScope {
  tenantId: string;
  period: BenchmarkPeriod;
  previousPeriod: BenchmarkPeriod;
  locationIds: string[];
  locations: Array<Location & { _id: unknown }>;
}

interface BenchmarkEntry {
  employeeId: string;
  locationId: string;
  netDurationMinutes?: number;
  durationMinutes?: number;
  breakMinutes?: number;
}

interface BenchmarkShift {
  locationId: string;
  startTime: Date;
  endTime: Date;
  assignedUserIds?: string[];
  requiredStaffCount?: number;
  status: StaffShiftStatus;
}

interface BenchmarkOrder {
  locationId: string;
  total?: number;
  refundTotal?: number;
}

interface BenchmarkSnapshot {
  locationId: string;
  accuracy: number;
}

interface BenchmarkUser {
  _id: unknown;
  hourlyRate?: number;
  weeklyHours?: number;
  contractHoursPerWeek?: number;
}

interface MetricAccumulator {
  id: string;
  name: string;
  revenue: number;
  laborCost: number;
  actualHours: number;
  plannedHours: number;
  overtimeHours: number;
  forecastAccuracyTotal: number;
  forecastAccuracyCount: number;
  underStaffingHours: number;
  overStaffingHours: number;
  locationIds: Set<string>;
}

export interface BenchmarkRow {
  id: string;
  name: string;
  areaId?: string;
  areaName?: string;
  regionId?: string;
  regionName?: string;
  score: number;
  previousScore: number;
  scoreChange: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  badge: BenchmarkBadge;
  revenue: number;
  previousRevenue: number;
  revenueChangePercent: number;
  laborCost: number;
  laborCostPercentage: number;
  revenuePerHour: number;
  forecastAccuracy: number | null;
  plannedHours: number;
  actualHours: number;
  overtimeHours: number;
  overtimeRate: number;
  underStaffingHours: number;
  overStaffingHours: number;
}

@Injectable()
export class BenchmarkingService {
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
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(ForecastSnapshot.name)
    private readonly forecastSnapshotModel: Model<ForecastSnapshotDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getBenchmarking(
    actor: AuthenticatedUser,
    query: BenchmarkingQueryDto,
  ) {
    this.assertCanViewBenchmarking(actor);
    const scope = await this.resolveScope(actor, query);
    const [areas, regions, current, previous] = await Promise.all([
      this.areaModel.find({ tenantId: scope.tenantId }).select('_id name').lean(),
      this.regionModel.find({ tenantId: scope.tenantId }).select('_id name areaId').lean(),
      this.collectMetrics(scope, scope.period),
      this.collectMetrics(scope, scope.previousPeriod),
    ]);

    const areaById = new Map(
      areas.map((area) => [this.stringifyId(area._id), area.name]),
    );
    const regionById = new Map(
      regions.map((region) => [
        this.stringifyId(region._id),
        { name: region.name, areaId: region.areaId },
      ]),
    );
    const previousScores = this.previousLocationScores(previous);
    const locations = this.locationRows(
      scope,
      current,
      previous,
      previousScores,
      areaById,
      regionById,
    );
    const areasRows = this.groupRows(
      locations,
      (row) => row.areaId ?? 'unknown-area',
      (row) => row.areaName ?? 'Ohne Bereich',
    );
    const regionsRows = this.groupRows(
      locations,
      (row) => row.regionId ?? 'unknown-region',
      (row) => row.regionName ?? 'Ohne Region',
    );
    const summary = this.summary(locations, areasRows, regionsRows);

    return {
      generatedAt: new Date().toISOString(),
      period: {
        mode: scope.period.mode,
        dateFrom: scope.period.dateFrom,
        dateTo: scope.period.dateTo,
        week: scope.period.week,
        month: scope.period.month,
        quarter: scope.period.quarter,
        year: scope.period.year,
      },
      formula:
        'Benchmark Score = 30% Umsatzentwicklung + 25% Personalkostenquote + 20% Umsatz pro Stunde + 15% Forecast Accuracy + 10% Ueberstundenquote.',
      summary,
      locations,
      areas: areasRows,
      regions: regionsRows,
      rankings: {
        topRevenue: this.rank(locations, (row) => row.revenue, 'desc'),
        topLaborCostPercentage: this.rank(
          locations,
          (row) => row.laborCostPercentage,
          'asc',
        ),
        topRevenuePerHour: this.rank(locations, (row) => row.revenuePerHour, 'desc'),
        topForecastAccuracy: this.rank(
          locations,
          (row) => row.forecastAccuracy ?? 0,
          'desc',
        ),
        topProductivity: this.rank(locations, (row) => row.score, 'desc'),
        bottomPerformers: this.rank(locations, (row) => row.score, 'asc'),
      },
      filters: {
        period: query.period ?? scope.period.mode,
        areaId: query.areaId,
        regionId: query.regionId,
        locationId: query.locationId,
      },
    };
  }

  private async resolveScope(
    actor: AuthenticatedUser,
    query: BenchmarkingQueryDto,
  ): Promise<BenchmarkScope> {
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine operativen Benchmarks nutzen');
    }
    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    }
    const readableLocationIds = await this.accessPolicy.getReadableLocationIds(actor);
    const locationFilter: Record<string, unknown> = {
      tenantId: actor.tenantId,
      _id: { $in: query.locationId ? [query.locationId] : readableLocationIds },
      isActive: { $ne: false },
    };
    if (query.areaId) locationFilter.areaId = query.areaId;
    if (query.regionId) locationFilter.regionId = query.regionId;
    const locations = await this.locationModel
      .find(locationFilter)
      .select('_id name areaId regionId companyId')
      .lean();
    const period = this.resolvePeriod(query);
    return {
      tenantId: actor.tenantId,
      period,
      previousPeriod: this.previousPeriod(period),
      locationIds: locations.map((location) => this.stringifyId(location._id)),
      locations,
    };
  }

  private async collectMetrics(scope: BenchmarkScope, period: BenchmarkPeriod) {
    const [orders, entries, shifts, snapshots] = await Promise.all([
      this.orderModel
        .find({
          tenantId: scope.tenantId,
          locationId: { $in: scope.locationIds },
          paymentStatus: PaymentStatus.Paid,
          status: { $ne: OrderStatus.Cancelled },
          createdAt: { $gte: period.from, $lt: period.to },
        })
        .lean() as unknown as Promise<BenchmarkOrder[]>,
      this.timeEntryModel
        .find({
          tenantId: scope.tenantId,
          locationId: { $in: scope.locationIds },
          status: { $in: [TimeEntryStatus.Closed, TimeEntryStatus.Corrected] },
          clockIn: { $gte: period.from, $lt: period.to },
        })
        .lean() as unknown as Promise<BenchmarkEntry[]>,
      this.shiftModel
        .find({
          tenantId: scope.tenantId,
          locationId: { $in: scope.locationIds },
          status: { $ne: StaffShiftStatus.Cancelled },
          startTime: { $gte: period.from, $lt: period.to },
        })
        .lean() as unknown as Promise<BenchmarkShift[]>,
      this.forecastSnapshotModel
        .find({
          tenantId: scope.tenantId,
          locationId: { $in: scope.locationIds },
          date: { $gte: period.from, $lt: period.to },
        })
        .lean() as unknown as Promise<BenchmarkSnapshot[]>,
    ]);
    const userIds = [...new Set(entries.map((entry) => entry.employeeId))];
    const users = await this.userModel
      .find({ tenantId: scope.tenantId, _id: { $in: userIds } })
      .select('_id hourlyRate weeklyHours contractHoursPerWeek')
      .lean() as unknown as BenchmarkUser[];
    const userById = new Map(users.map((user) => [this.stringifyId(user._id), user]));
    const rows = new Map<string, MetricAccumulator>();
    for (const location of scope.locations) {
      const locationId = this.stringifyId(location._id);
      rows.set(locationId, this.emptyMetric(locationId, location.name));
    }
    for (const order of orders) {
      const metric = rows.get(order.locationId);
      if (!metric) continue;
      metric.revenue += this.orderRevenue(order);
    }
    const hoursByUserLocation = new Map<string, number>();
    for (const entry of entries) {
      const metric = rows.get(entry.locationId);
      if (!metric) continue;
      const hours = this.entryHours(entry);
      const user = userById.get(entry.employeeId);
      metric.actualHours += hours;
      metric.laborCost += hours * Number(user?.hourlyRate ?? 0);
      const key = `${entry.locationId}:${entry.employeeId}`;
      hoursByUserLocation.set(key, (hoursByUserLocation.get(key) ?? 0) + hours);
    }
    for (const [key, hours] of hoursByUserLocation) {
      const [locationId, userId] = key.split(':');
      const user = userById.get(userId);
      const metric = rows.get(locationId);
      if (!metric) continue;
      const target = this.targetHoursForPeriod(user, period);
      metric.overtimeHours += Math.max(0, hours - target);
    }
    for (const shift of shifts) {
      const metric = rows.get(shift.locationId);
      if (!metric) continue;
      metric.plannedHours += this.shiftHours(shift);
    }
    for (const snapshot of snapshots) {
      const metric = rows.get(snapshot.locationId);
      if (!metric) continue;
      metric.forecastAccuracyTotal += Number(snapshot.accuracy ?? 0);
      metric.forecastAccuracyCount += 1;
    }
    for (const metric of rows.values()) {
      const staffingVariance = metric.plannedHours - metric.actualHours;
      metric.underStaffingHours = Math.max(0, -staffingVariance);
      metric.overStaffingHours = Math.max(0, staffingVariance);
    }
    return rows;
  }

  private previousLocationScores(
    previous: Map<string, MetricAccumulator>,
  ) {
    const previousRows = [...previous.values()];
    const previousAvgRevenuePerHour = this.average(
      previousRows.map((row) => this.revenuePerHour(row)),
    );
    return new Map(
      previousRows.map((row) => [
        row.id,
        this.benchmarkScore(
          row,
          undefined,
          previousAvgRevenuePerHour,
        ),
      ]),
    );
  }

  private locationRows(
    scope: BenchmarkScope,
    metrics: Map<string, MetricAccumulator>,
    previousMetrics: Map<string, MetricAccumulator>,
    previousScores: Map<string, number>,
    areaById: Map<string, string>,
    regionById: Map<string, { name: string; areaId?: string }>,
  ): BenchmarkRow[] {
    const rows = [...metrics.values()];
    const averageRevenuePerHour = this.average(rows.map((row) => this.revenuePerHour(row)));
    return scope.locations
      .map((location) => {
        const locationId = this.stringifyId(location._id);
        const metric = metrics.get(locationId) ?? this.emptyMetric(locationId, location.name);
        const previousMetric = previousMetrics.get(locationId);
        const previousScore = previousScores.get(locationId) ?? 50;
        const score = this.benchmarkScore(
          metric,
          previousMetric?.revenue,
          averageRevenuePerHour,
        );
        const region = location.regionId ? regionById.get(location.regionId) : undefined;
        const areaId = location.areaId ?? region?.areaId;
        return this.toBenchmarkRow(
          metric,
          score,
          previousScore,
          previousMetric?.revenue ?? 0,
          {
            areaId,
            areaName: areaId ? areaById.get(areaId) ?? areaId : undefined,
            regionId: location.regionId,
            regionName: location.regionId
              ? region?.name ?? location.regionId
              : undefined,
          },
        );
      })
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name));
  }

  private groupRows(
    locations: BenchmarkRow[],
    idFor: (row: BenchmarkRow) => string,
    nameFor: (row: BenchmarkRow) => string,
  ): BenchmarkRow[] {
    const groups = new Map<string, MetricAccumulator & { previousRevenue: number; previousScoreTotal: number; previousCount: number }>();
    for (const row of locations) {
      const id = idFor(row);
      const group = groups.get(id) ?? {
        ...this.emptyMetric(id, nameFor(row)),
        previousRevenue: 0,
        previousScoreTotal: 0,
        previousCount: 0,
      };
      group.revenue += row.revenue;
      group.laborCost += row.laborCost;
      group.actualHours += row.actualHours;
      group.plannedHours += row.plannedHours;
      group.overtimeHours += row.overtimeHours;
      if (row.forecastAccuracy !== null) {
        group.forecastAccuracyTotal += row.forecastAccuracy;
        group.forecastAccuracyCount += 1;
      }
      group.underStaffingHours += row.underStaffingHours;
      group.overStaffingHours += row.overStaffingHours;
      group.locationIds.add(row.id);
      group.previousRevenue += row.previousRevenue;
      group.previousScoreTotal += row.previousScore;
      group.previousCount += 1;
      groups.set(id, group);
    }
    const groupValues = [...groups.values()];
    const averageRevenuePerHour = this.average(groupValues.map((row) => this.revenuePerHour(row)));
    return groupValues
      .map((group) => {
        const previousScore =
          group.previousCount > 0 ? group.previousScoreTotal / group.previousCount : 50;
        const score = this.benchmarkScore(group, group.previousRevenue, averageRevenuePerHour);
        return this.toBenchmarkRow(group, score, previousScore, group.previousRevenue);
      })
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name));
  }

  private toBenchmarkRow(
    metric: MetricAccumulator,
    score: number,
    previousScore: number,
    previousRevenue: number,
    hierarchy: {
      areaId?: string;
      areaName?: string;
      regionId?: string;
      regionName?: string;
    } = {},
  ): BenchmarkRow {
    const revenue = this.roundMoney(metric.revenue);
    const roundedPreviousRevenue = this.roundMoney(previousRevenue);
    const laborCost = this.roundMoney(metric.laborCost);
    const actualHours = this.roundHours(metric.actualHours);
    const plannedHours = this.roundHours(metric.plannedHours);
    const overtimeHours = this.roundHours(metric.overtimeHours);
    const forecastAccuracy =
      metric.forecastAccuracyCount > 0
        ? this.roundHours(metric.forecastAccuracyTotal / metric.forecastAccuracyCount)
        : null;
    const scoreChange = this.roundHours(score - previousScore);
    return {
      id: metric.id,
      name: metric.name,
      ...hierarchy,
      score,
      previousScore: this.roundHours(previousScore),
      scoreChange,
      trend: scoreChange > 1 ? 'UP' : scoreChange < -1 ? 'DOWN' : 'STABLE',
      badge: score >= 80 ? 'TOP_PERFORMER' : score >= 60 ? 'AVERAGE' : 'NEEDS_ATTENTION',
      revenue,
      previousRevenue: roundedPreviousRevenue,
      revenueChangePercent:
        roundedPreviousRevenue > 0
          ? this.roundHours(((revenue - roundedPreviousRevenue) / roundedPreviousRevenue) * 100)
          : 0,
      laborCost,
      laborCostPercentage: revenue > 0 ? this.roundHours((laborCost / revenue) * 100) : 0,
      revenuePerHour: this.revenuePerHour(metric),
      forecastAccuracy,
      plannedHours,
      actualHours,
      overtimeHours,
      overtimeRate: actualHours > 0 ? this.roundHours((overtimeHours / actualHours) * 100) : 0,
      underStaffingHours: this.roundHours(metric.underStaffingHours),
      overStaffingHours: this.roundHours(metric.overStaffingHours),
    };
  }

  private benchmarkScore(
    metric: MetricAccumulator,
    previousRevenue: number | undefined,
    averageRevenuePerHour: number,
  ): number {
    const revenueGrowthScore = previousRevenue === undefined
      ? 50
      : this.clamp(50 + this.revenueGrowth(metric, previousRevenue), 0, 100);
    const laborCostPercentage =
      metric.revenue > 0 ? (metric.laborCost / metric.revenue) * 100 : 0;
    const laborCostScore = laborCostPercentage > 0
      ? this.clamp(100 - Math.max(0, laborCostPercentage - 18) * 4, 0, 100)
      : 50;
    const revenuePerHour = this.revenuePerHour(metric);
    const revenuePerHourScore = averageRevenuePerHour > 0
      ? this.clamp((revenuePerHour / averageRevenuePerHour) * 70, 0, 100)
      : 50;
    const forecastAccuracy = metric.forecastAccuracyCount > 0
      ? metric.forecastAccuracyTotal / metric.forecastAccuracyCount
      : 50;
    const overtimeRate =
      metric.actualHours > 0 ? (metric.overtimeHours / metric.actualHours) * 100 : 0;
    const overtimeScore = this.clamp(100 - overtimeRate * 5, 0, 100);
    return this.roundHours(
      revenueGrowthScore * 0.3 +
        laborCostScore * 0.25 +
        revenuePerHourScore * 0.2 +
        forecastAccuracy * 0.15 +
        overtimeScore * 0.1,
    );
  }

  private revenueGrowth(metric: MetricAccumulator, previousRevenue: number): number {
    return ((metric.revenue - previousRevenue) / Math.max(previousRevenue, 1)) * 100;
  }

  private summary(
    locations: BenchmarkRow[],
    areas: BenchmarkRow[],
    regions: BenchmarkRow[],
  ) {
    const bestLocation = locations[0] ?? null;
    const weakestLocation = [...locations].sort((first, second) => first.score - second.score)[0] ?? null;
    return {
      bestLocation,
      weakestLocation,
      bestArea: areas[0] ?? null,
      bestRegion: regions[0] ?? null,
      averageScore: this.roundHours(this.average(locations.map((row) => row.score))),
      locationCount: locations.length,
      areaCount: areas.length,
      regionCount: regions.length,
    };
  }

  private rank(rows: BenchmarkRow[], valueFor: (row: BenchmarkRow) => number, direction: 'asc' | 'desc') {
    return [...rows]
      .sort((first, second) => {
        const diff = valueFor(first) - valueFor(second);
        return direction === 'asc' ? diff : -diff;
      })
      .slice(0, 5);
  }

  private emptyMetric(id: string, name: string): MetricAccumulator {
    return {
      id,
      name,
      revenue: 0,
      laborCost: 0,
      actualHours: 0,
      plannedHours: 0,
      overtimeHours: 0,
      forecastAccuracyTotal: 0,
      forecastAccuracyCount: 0,
      underStaffingHours: 0,
      overStaffingHours: 0,
      locationIds: new Set<string>(),
    };
  }

  private targetHoursForPeriod(
    user: BenchmarkUser | undefined,
    period: BenchmarkPeriod,
  ): number {
    const weeklyHours = Number(user?.contractHoursPerWeek ?? user?.weeklyHours ?? 0);
    if (weeklyHours <= 0) return 0;
    return (weeklyHours / 7) * period.days;
  }

  private revenuePerHour(metric: MetricAccumulator): number {
    return metric.actualHours > 0 ? this.roundMoney(metric.revenue / metric.actualHours) : 0;
  }

  private shiftHours(shift: BenchmarkShift): number {
    const start = new Date(shift.startTime).getTime();
    const end = new Date(shift.endTime).getTime();
    const duration = Math.max(0, end - start) / 3600000;
    const assignedCount = shift.assignedUserIds?.length ?? 0;
    const staffCount = Math.max(assignedCount, Number(shift.requiredStaffCount ?? 1));
    return duration * staffCount;
  }

  private entryHours(entry: BenchmarkEntry): number {
    const minutes =
      entry.netDurationMinutes ??
      Math.max(0, Number(entry.durationMinutes ?? 0) - Number(entry.breakMinutes ?? 0));
    return minutes / 60;
  }

  private orderRevenue(order: BenchmarkOrder): number {
    return Math.max(0, Number(order.total ?? 0) - Number(order.refundTotal ?? 0));
  }

  private resolvePeriod(query: BenchmarkingQueryDto): BenchmarkPeriod {
    const now = new Date();
    const year = query.year ?? now.getUTCFullYear();
    const mode = query.period ?? (query.quarter ? 'quarter' : query.month ? 'month' : 'week');
    if (mode === 'quarter') {
      const quarter = query.quarter ?? Math.floor(now.getUTCMonth() / 3) + 1;
      const from = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      const to = new Date(Date.UTC(year, quarter * 3, 1));
      return this.period('quarter', from, to, year, { quarter });
    }
    if (mode === 'year') {
      const from = new Date(Date.UTC(year, 0, 1));
      const to = new Date(Date.UTC(year + 1, 0, 1));
      return this.period('year', from, to, year, {});
    }
    if (mode === 'month') {
      const month = query.month ?? now.getUTCMonth() + 1;
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 1));
      return this.period('month', from, to, year, { month });
    }
    const parts = query.week
      ? { week: query.week, year }
      : this.isoWeekParts(now);
    const { from, to } = this.weekDateRange(parts.week, parts.year);
    return this.period('week', from, to, parts.year, { week: parts.week });
  }

  private previousPeriod(period: BenchmarkPeriod): BenchmarkPeriod {
    const from = new Date(period.from);
    const to = new Date(period.to);
    const days = period.days;
    from.setUTCDate(from.getUTCDate() - days);
    to.setUTCDate(to.getUTCDate() - days);
    const weekParts = this.isoWeekParts(from);
    const previousYear = period.mode === 'week' ? weekParts.year : from.getUTCFullYear();
    return this.period(period.mode, from, to, previousYear, {
      week: period.mode === 'week' ? weekParts.week : undefined,
      month: period.mode === 'month' ? from.getUTCMonth() + 1 : undefined,
      quarter: period.mode === 'quarter' ? Math.floor(from.getUTCMonth() / 3) + 1 : undefined,
    });
  }

  private period(
    mode: BenchmarkPeriodMode,
    from: Date,
    to: Date,
    year: number,
    parts: { week?: number; month?: number; quarter?: number },
  ): BenchmarkPeriod {
    return {
      mode,
      from,
      to,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      year,
      days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)),
      ...parts,
    };
  }

  private weekDateRange(week: number, year: number): { from: Date; to: Date } {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const from = new Date(jan4);
    from.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 7);
    return { from, to };
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

  private assertCanViewBenchmarking(user: AuthenticatedUser): void {
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
        Role.Personalabteilung,
        Role.Buchhaltung,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer Benchmarking');
    }
  }

  private average(values: number[]): number {
    const filtered = values.filter((value) => Number.isFinite(value));
    if (!filtered.length) return 0;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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
}
