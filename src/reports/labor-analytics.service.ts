import { ForbiddenException, Injectable } from '@nestjs/common';
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
  StaffWorkingTimeSettings,
  StaffWorkingTimeSettingsDocument,
} from '../staff-planning/schemas/staff-working-time-settings.schema';
import {
  TimeEntry,
  TimeEntryDocument,
  TimeEntryStatus,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { LaborAnalyticsQueryDto } from './dto/labor-analytics-query.dto';

interface LaborAnalyticsPeriod {
  mode: 'week' | 'month' | 'custom';
  from: Date;
  to: Date;
  dateFrom: string;
  dateTo: string;
  week?: number;
  year?: number;
  month?: number;
}

interface LaborScope {
  tenantId: string;
  period: LaborAnalyticsPeriod;
  locationIds: string[];
  locations: Array<LocationDocument | Location & { _id: unknown }>;
  departmentId?: string;
  employeeId?: string;
}

interface LaborAccumulator {
  id: string;
  name: string;
  revenue: number;
  laborCost: number;
  actualHours: number;
  employeeIds: Set<string>;
}

type LaborTimeEntry = Pick<
  TimeEntry,
  | 'employeeId'
  | 'locationId'
  | 'netDurationMinutes'
  | 'durationMinutes'
  | 'breakMinutes'
>;

export interface LaborAnalyticsRow {
  id: string;
  name: string;
  revenue: number;
  laborCost: number;
  laborCostPercentage: number;
  revenuePerHour: number;
  actualHours: number;
  employeeCount: number;
  warning?: {
    type: 'LABOR_COST_WARNING';
    message: string;
    valuePercent: number;
    thresholdPercent: number;
  };
}

export interface LaborAnalyticsEmployeeRow extends LaborAnalyticsRow {
  employeeId: string;
  departmentIds: string[];
  departmentNames: string[];
  locationIds: string[];
  locationNames: string[];
  hourlyRate: number;
}

@Injectable()
export class LaborAnalyticsService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(StaffWorkingTimeSettings.name)
    private readonly settingsModel: Model<StaffWorkingTimeSettingsDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getLaborAnalytics(
    actor: AuthenticatedUser,
    query: LaborAnalyticsQueryDto,
  ) {
    this.assertCanViewLaborAnalytics(actor);
    const scope = await this.resolveScope(actor, query);
    const settings = await this.getSettings(actor);
    const threshold = settings?.laborCostWarningThresholdPercent ?? 30;
    const [orders, users, departments] = await Promise.all([
      this.findRevenueOrders(scope),
      this.findUsers(scope),
      this.departmentModel
        .find({ tenantId: scope.tenantId })
        .select('_id name')
        .lean(),
    ]);
    const userIds = users.map((user) => this.stringifyId(user._id));
    const entries = await this.findTimeEntries(scope, userIds);

    const locationById = new Map(
      scope.locations.map((location) => [
        this.stringifyId(location._id),
        location.name,
      ]),
    );
    const departmentById = new Map(
      departments.map((department) => [
        this.stringifyId(department._id),
        department.name,
      ]),
    );
    const userById = new Map(
      users.map((user) => [this.stringifyId(user._id), user]),
    );

    const revenueByLocation = new Map<string, number>();
    for (const order of orders) {
      const revenue = this.orderRevenue(order);
      revenueByLocation.set(
        order.locationId,
        (revenueByLocation.get(order.locationId) ?? 0) + revenue,
      );
    }

    const totalHoursByLocation = new Map<string, number>();
    for (const entry of entries) {
      const hours = this.entryHours(entry);
      totalHoursByLocation.set(
        entry.locationId,
        (totalHoursByLocation.get(entry.locationId) ?? 0) + hours,
      );
    }

    const locationGroups = new Map<string, LaborAccumulator>();
    const departmentGroups = new Map<string, LaborAccumulator>();
    const employeeGroups = new Map<string, LaborAccumulator>();
    for (const location of scope.locations) {
      const locationId = this.stringifyId(location._id);
      this.ensureGroup(locationGroups, locationId, location.name).revenue =
        revenueByLocation.get(locationId) ?? 0;
    }

    for (const entry of entries) {
      const user = userById.get(entry.employeeId);
      if (!user) continue;
      const hours = this.entryHours(entry);
      const hourlyRate = Number(user.hourlyRate ?? 0);
      const laborCost = hours * hourlyRate;
      const locationRevenuePerHour =
        (revenueByLocation.get(entry.locationId) ?? 0) /
        Math.max(totalHoursByLocation.get(entry.locationId) ?? 0, 1);
      const allocatedRevenue = hours * locationRevenuePerHour;

      this.addLabor({
        groups: locationGroups,
        id: entry.locationId,
        name: locationById.get(entry.locationId) ?? entry.locationId,
        employeeId: entry.employeeId,
        actualHours: hours,
        laborCost,
      });

      const departmentId = this.primaryDepartmentId(user);
      if (departmentId) {
        this.addLabor({
          groups: departmentGroups,
          id: departmentId,
          name: departmentById.get(departmentId) ?? departmentId,
          employeeId: entry.employeeId,
          actualHours: hours,
          laborCost,
          revenue: allocatedRevenue,
        });
      }

      this.addLabor({
        groups: employeeGroups,
        id: entry.employeeId,
        name: this.employeeDisplayName(user),
        employeeId: entry.employeeId,
        actualHours: hours,
        laborCost,
        revenue: allocatedRevenue,
      });
    }

    const summary = this.toRow(
      {
        id: 'total',
        name: 'Gesamt',
        revenue: [...revenueByLocation.values()].reduce((sum, value) => sum + value, 0),
        laborCost: entries.reduce((sum, entry) => {
          const user = userById.get(entry.employeeId);
          return sum + this.entryHours(entry) * Number(user?.hourlyRate ?? 0);
        }, 0),
        actualHours: entries.reduce((sum, entry) => sum + this.entryHours(entry), 0),
        employeeIds: new Set(entries.map((entry) => entry.employeeId)),
      },
      threshold,
    );

    const employees = this.groupRows(employeeGroups, threshold).map((row) => {
      const user = userById.get(row.id);
      const departmentIds = user ? this.getUserDepartmentIds(user) : [];
      const locationIds = user ? this.getUserLocationIds(user) : [];
      return {
        ...row,
        employeeId: row.id,
        departmentIds,
        departmentNames: departmentIds.map((id) => departmentById.get(id) ?? id),
        locationIds,
        locationNames: locationIds.map((id) => locationById.get(id) ?? id),
        hourlyRate: Number(user?.hourlyRate ?? 0),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      period: {
        mode: scope.period.mode,
        dateFrom: scope.period.dateFrom,
        dateTo: scope.period.dateTo,
        week: scope.period.week,
        year: scope.period.year,
        month: scope.period.month,
      },
      thresholdPercent: threshold,
      summary,
      locations: this.groupRows(locationGroups, threshold),
      departments: this.groupRows(departmentGroups, threshold),
      employees,
      warnings: [
        ...this.groupRows(locationGroups, threshold),
        ...this.groupRows(departmentGroups, threshold),
        ...employees,
      ]
        .filter((row) => row.warning)
        .map((row) => row.warning),
      filters: {
        locationId: query.locationId,
        departmentId: query.departmentId,
        employeeId: query.employeeId,
      },
    };
  }

  private async resolveScope(
    actor: AuthenticatedUser,
    query: LaborAnalyticsQueryDto,
  ): Promise<LaborScope> {
    if (!actor.tenantId || this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine operativen Reports nutzen');
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
      .select('_id name')
      .lean();

    return {
      tenantId: actor.tenantId,
      period: this.resolvePeriod(query),
      locationIds: locations.map((location) => this.stringifyId(location._id)),
      locations,
      departmentId: query.departmentId,
      employeeId: query.employeeId,
    };
  }

  private findRevenueOrders(scope: LaborScope) {
    return this.orderModel
      .find({
        tenantId: scope.tenantId,
        locationId: { $in: scope.locationIds },
        paymentStatus: PaymentStatus.Paid,
        status: { $ne: OrderStatus.Cancelled },
        createdAt: { $gte: scope.period.from, $lte: scope.period.to },
      })
      .lean();
  }

  private async findUsers(scope: LaborScope) {
    const query: Record<string, unknown> = {
      tenantId: scope.tenantId,
      isActive: true,
      $or: [
        { locationId: { $in: scope.locationIds } },
        { locationIds: { $in: scope.locationIds } },
        { managedLocationIds: { $in: scope.locationIds } },
      ],
    };
    if (scope.employeeId) {
      query._id = scope.employeeId;
    }
    if (scope.departmentId) {
      query.$and = [
        {
          $or: [
            { departmentId: scope.departmentId },
            { departmentIds: scope.departmentId },
          ],
        },
      ];
    }
    return this.userModel.find(query).lean();
  }

  private async findTimeEntries(
    scope: LaborScope,
    employeeIds: string[],
  ): Promise<LaborTimeEntry[]> {
    if (!employeeIds.length) return [];
    const query: Record<string, unknown> = {
      tenantId: scope.tenantId,
      employeeId: { $in: employeeIds },
      locationId: { $in: scope.locationIds },
      status: { $in: [TimeEntryStatus.Closed, TimeEntryStatus.Corrected] },
      clockIn: { $gte: scope.period.from, $lte: scope.period.to },
    };
    if (scope.employeeId) {
      query.employeeId = scope.employeeId;
    }
    return this.timeEntryModel.find(query).lean();
  }

  private async getSettings(actor: AuthenticatedUser) {
    return this.settingsModel
      .findOne(actor.tenantId ? { tenantId: actor.tenantId } : { companyId: actor.companyId })
      .lean();
  }

  private groupRows(
    groups: Map<string, LaborAccumulator>,
    thresholdPercent: number,
  ): LaborAnalyticsRow[] {
    return [...groups.values()]
      .map((group) => this.toRow(group, thresholdPercent))
      .sort((first, second) => second.revenue - first.revenue || first.name.localeCompare(second.name));
  }

  private toRow(
    group: LaborAccumulator,
    thresholdPercent: number,
  ): LaborAnalyticsRow {
    const revenue = this.roundMoney(group.revenue);
    const laborCost = this.roundMoney(group.laborCost);
    const actualHours = this.roundHours(group.actualHours);
    const laborCostPercentage = revenue > 0 ? this.roundHours((laborCost / revenue) * 100) : 0;
    const revenuePerHour = actualHours > 0 ? this.roundMoney(revenue / actualHours) : 0;
    return {
      id: group.id,
      name: group.name,
      revenue,
      laborCost,
      laborCostPercentage,
      revenuePerHour,
      actualHours,
      employeeCount: group.employeeIds.size,
      warning:
        laborCostPercentage > thresholdPercent
          ? {
              type: 'LABOR_COST_WARNING',
              message: `${group.name}: Personalkostenquote ${laborCostPercentage}% liegt ueber ${thresholdPercent}%.`,
              valuePercent: laborCostPercentage,
              thresholdPercent,
            }
          : undefined,
    };
  }

  private addLabor(options: {
    groups: Map<string, LaborAccumulator>;
    id: string;
    name: string;
    employeeId: string;
    actualHours: number;
    laborCost: number;
    revenue?: number;
  }): void {
    const group = this.ensureGroup(options.groups, options.id, options.name);
    group.employeeIds.add(options.employeeId);
    group.actualHours += options.actualHours;
    group.laborCost += options.laborCost;
    group.revenue += options.revenue ?? 0;
  }

  private ensureGroup(
    groups: Map<string, LaborAccumulator>,
    id: string,
    name: string,
  ): LaborAccumulator {
    const existing = groups.get(id);
    if (existing) return existing;
    const created: LaborAccumulator = {
      id,
      name,
      revenue: 0,
      laborCost: 0,
      actualHours: 0,
      employeeIds: new Set<string>(),
    };
    groups.set(id, created);
    return created;
  }

  private orderRevenue(order: Pick<Order, 'total' | 'refundTotal'>): number {
    return Math.max(0, Number(order.total ?? 0) - Number(order.refundTotal ?? 0));
  }

  private entryHours(entry: Pick<TimeEntry, 'netDurationMinutes' | 'durationMinutes' | 'breakMinutes'>): number {
    const minutes =
      entry.netDurationMinutes ??
      Math.max(0, Number(entry.durationMinutes ?? 0) - Number(entry.breakMinutes ?? 0));
    return minutes / 60;
  }

  private resolvePeriod(query: LaborAnalyticsQueryDto): LaborAnalyticsPeriod {
    const year = query.year ?? new Date().getUTCFullYear();
    if (query.week) {
      const { from, to } = this.weekDateRange(query.week, year);
      return {
        mode: 'week',
        from,
        to,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
        week: query.week,
        year,
      };
    }
    if (query.month) {
      const from = new Date(Date.UTC(year, query.month - 1, 1));
      const to = new Date(Date.UTC(year, query.month, 1));
      to.setUTCMilliseconds(-1);
      return {
        mode: 'month',
        from,
        to,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
        month: query.month,
        year,
      };
    }
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : this.startOfDay(new Date());
      const to = query.dateTo ? this.endOfDay(new Date(query.dateTo)) : this.endOfDay(from);
      return {
        mode: 'custom',
        from,
        to,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      };
    }
    const parts = this.isoWeekParts(new Date());
    const { from, to } = this.weekDateRange(parts.week, parts.year);
    return {
      mode: 'week',
      from,
      to,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      week: parts.week,
      year: parts.year,
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
    to.setUTCMilliseconds(-1);
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

  private startOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private endOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
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

  private getUserLocationIds(user: {
    locationId?: string;
    locationIds?: string[];
    managedLocationIds?: string[];
  }): string[] {
    return [
      ...new Set([
        ...(user.locationIds ?? []),
        ...(user.managedLocationIds ?? []),
        ...(user.locationId ? [user.locationId] : []),
      ]),
    ];
  }

  private employeeDisplayName(user: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
  }

  private assertCanViewLaborAnalytics(user: AuthenticatedUser): void {
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
      throw new ForbiddenException('Keine Berechtigung fuer Personalcontrolling');
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
}
