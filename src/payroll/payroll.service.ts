import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  StaffAbsence,
  StaffAbsenceDocument,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftDocument,
  StaffShiftStatus,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  TimeEntry,
  TimeEntryDocument,
} from '../time-tracking/schemas/time-entry.schema';
import {
  User,
  UserDocument,
  UserResponse,
  toUserResponse,
} from '../users/schemas/user.schema';
import {
  PayrollPeriod,
  PayrollPeriodDocument,
  PayrollPeriodStatus,
} from './schemas/payroll-period.schema';

export interface PayrollQuery {
  locationId?: string;
  employeeId?: string;
  start?: string;
  end?: string;
}

export interface PayrollEmployeeSummary {
  employee: UserResponse;
  plannedHours: number;
  actualHours: number;
  breakHours: number;
  overtimeHours: number;
  absenceDays: number;
  sickDays: number;
  vacationDays: number;
  unpaidDays: number;
  otherAbsenceDays: number;
  hourlyRate: number;
  grossPay: number;
  laborCost: number;
  minijobWarning: boolean;
  warnings: string[];
}

export interface PayrollPeriodResponse {
  _id: string;
  start: string;
  end: string;
  locationId?: string;
  employeeId?: string;
  status: PayrollPeriodStatus;
  lockedAt?: string;
  lockedByUserId?: string;
}

export interface PayrollSummary {
  start: string;
  end: string;
  period: PayrollPeriodResponse;
  employees: PayrollEmployeeSummary[];
  totals: {
    plannedHours: number;
    actualHours: number;
    breakHours: number;
    overtimeHours: number;
    grossPay: number;
    laborCost: number;
    vacationDays: number;
    sickDays: number;
    unpaidDays: number;
    otherAbsenceDays: number;
  };
}

interface PayrollTotals {
  plannedHours: number;
  actualHours: number;
  breakHours: number;
  overtimeHours: number;
  grossPay: number;
  laborCost: number;
  vacationDays: number;
  sickDays: number;
  unpaidDays: number;
  otherAbsenceDays: number;
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(StaffShift.name)
    private readonly staffShiftModel: Model<StaffShiftDocument>,
    @InjectModel(StaffAbsence.name)
    private readonly absenceModel: Model<StaffAbsenceDocument>,
    @InjectModel(PayrollPeriod.name)
    private readonly payrollPeriodModel: Model<PayrollPeriodDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async summary(
    actor: AuthenticatedUser,
    query: PayrollQuery = {},
  ): Promise<PayrollSummary> {
    const range = this.resolveRange(query);
    const period = await this.ensurePeriod(actor, query, range);

    if (period.status === PayrollPeriodStatus.Locked) {
      return this.summaryFromLockedPeriod(period);
    }

    const calculated = await this.calculateSummary(actor, query, range);
    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      period: this.toPeriodResponse(period),
      ...calculated,
    };
  }

  async listPeriods(
    actor: AuthenticatedUser,
    query: PayrollQuery = {},
  ): Promise<PayrollPeriodResponse[]> {
    const filter = await this.periodFilter(actor, query);
    return this.payrollPeriodModel
      .find(filter)
      .sort({ start: -1, createdAt: -1 })
      .exec()
      .then((periods) => periods.map((period) => this.toPeriodResponse(period)));
  }

  async lockPeriod(
    actor: AuthenticatedUser,
    query: PayrollQuery,
  ): Promise<PayrollSummary> {
    const range = this.resolveRange(query);
    const period = await this.ensurePeriod(actor, query, range);

    if (period.status === PayrollPeriodStatus.Locked) {
      throw new ConflictException('Payroll-Periode ist bereits gesperrt');
    }

    const calculated = await this.calculateSummary(actor, query, range);
    period.status = PayrollPeriodStatus.Locked;
    period.lockedAt = new Date();
    period.lockedByUserId = actor.sub;
    period.employeeSnapshots = calculated.employees.map((employee) => ({
      ...employee,
    }));
    period.totalsSnapshot = { ...calculated.totals };
    await period.save();

    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      period: this.toPeriodResponse(period),
      ...calculated,
    };
  }

  async export(
    actor: AuthenticatedUser,
    query: PayrollQuery & { format?: 'csv' | 'xlsx' } = {},
  ) {
    const summary = await this.summary(actor, query);
    const rows = [
      [
        'Periode',
        'Status',
        'Standort',
        'Personalnummer',
        'Name',
        'E-Mail',
        'Vertragsart',
        'Sollstunden',
        'Iststunden / Netto',
        'Pausen',
        'Urlaub',
        'Krankheit',
        'Unbezahlt',
        'Sonstige Abwesenheit',
        'Abweichung',
        'Stundenlohn',
        'Bruttolohn',
        'Waehrung',
        'Warnungen',
      ],
      ...summary.employees.map((item) => [
        `${summary.start.slice(0, 10)} bis ${summary.end.slice(0, 10)}`,
        summary.period.status === PayrollPeriodStatus.Locked
          ? 'gesperrt'
          : 'offen',
        item.employee.locationId ?? '',
        item.employee.employeeNumber ?? '',
        item.employee.name,
        item.employee.email,
        item.employee.contractType ?? '',
        item.plannedHours,
        item.actualHours,
        item.breakHours,
        item.vacationDays,
        item.sickDays,
        item.unpaidDays,
        item.otherAbsenceDays,
        item.overtimeHours,
        item.hourlyRate,
        item.grossPay,
        'EUR',
        item.warnings.join(', '),
      ]),
    ];

    if (query.format === 'xlsx') {
      return {
        filename: `gastromania-payroll-${summary.start.slice(0, 10)}.xls`,
        mimeType: 'application/vnd.ms-excel',
        content: this.toExcelXml(rows),
      };
    }

    return {
      filename: `gastromania-payroll-${summary.start.slice(0, 10)}.csv`,
      mimeType: 'text/csv; charset=utf-8',
      content: this.toCsv(rows),
    };
  }

  private async calculateSummary(
    actor: AuthenticatedUser,
    query: PayrollQuery,
    range: { start: Date; end: Date },
  ): Promise<{ employees: PayrollEmployeeSummary[]; totals: PayrollTotals }> {
    const employeeQuery = await this.getEmployeeQuery(actor, query);
    const employees = await this.userModel
      .find(employeeQuery)
      .sort({ lastName: 1 })
      .exec();
    const employeeIds = employees.map((employee) => employee._id.toString());
    const scopedFilter = await this.accessPolicy.getScopedResourceFilter(
      actor,
      query.locationId,
    );

    const [entries, shifts, absences] = await Promise.all([
      this.timeEntryModel
        .find({
          ...scopedFilter,
          employeeId: { $in: employeeIds },
          clockIn: { $gte: range.start, $lt: range.end },
        })
        .exec(),
      this.staffShiftModel
        .find({
          ...scopedFilter,
          assignedUserIds: { $in: employeeIds },
          status: { $ne: StaffShiftStatus.Cancelled },
          startTime: { $gte: range.start, $lt: range.end },
        })
        .exec(),
      this.absenceModel
        .find({
          userId: { $in: employeeIds },
          status: StaffAbsenceStatus.Approved,
          startDate: { $lt: range.end },
          endDate: { $gt: range.start },
        })
        .exec(),
    ]);

    const summaries = employees.map((employee) => {
      const id = employee._id.toString();
      const employeeEntries = entries.filter(
        (entry) => entry.employeeId === id,
      );
      const employeeShifts = shifts.filter((shift) =>
        (shift.assignedUserIds ?? []).includes(id),
      );
      const employeeAbsences = absences.filter(
        (absence) => absence.userId === id,
      );
      const plannedHours = this.roundHours(
        employeeShifts.reduce(
          (sum, shift) =>
            sum + this.hoursBetween(shift.startTime, shift.endTime),
          0,
        ),
      );
      const breakHours = this.roundHours(
        employeeEntries.reduce(
          (sum, entry) => sum + (entry.breakMinutes ?? 0) / 60,
          0,
        ),
      );
      const actualHours = this.roundHours(
        employeeEntries.reduce((sum, entry) => {
          const netMinutes =
            entry.netDurationMinutes ??
            Math.max(
              0,
              this.hoursBetween(entry.clockIn, entry.clockOut ?? new Date()) *
                60 -
                (entry.breakMinutes ?? 0),
            );
          return sum + netMinutes / 60;
        }, 0),
      );
      const overtimeHours = this.roundHours(actualHours - plannedHours);
      const hourlyRate =
        employee.hourlyRate ?? this.monthlyToHourly(employee.monthlySalary);
      const grossPay = this.roundMoney(actualHours * hourlyRate);
      const vacationDays = this.countAbsenceDays(
        employeeAbsences,
        StaffAbsenceType.Vacation,
      );
      const sickDays = this.countAbsenceDays(
        employeeAbsences,
        StaffAbsenceType.Sick,
      );
      const unpaidDays = this.countAbsenceDays(
        employeeAbsences,
        StaffAbsenceType.Unpaid,
      );
      const otherAbsenceDays =
        this.countAbsenceDays(employeeAbsences, StaffAbsenceType.Other) +
        this.countAbsenceDays(employeeAbsences, StaffAbsenceType.Unavailable);
      const minijobWarning =
        employee.contractType === 'Minijob' && grossPay >= 538 * 0.9;
      const hasLocationAssignment = Boolean(
        employee.locationId || employee.locationIds?.length,
      );
      const hasWorkData =
        plannedHours > 0 ||
        actualHours > 0 ||
        vacationDays > 0 ||
        sickDays > 0 ||
        unpaidDays > 0 ||
        otherAbsenceDays > 0;
      const warnings = [
        !hourlyRate ? 'Stundenlohn fehlt' : '',
        !hasWorkData ? 'Keine Arbeitszeitdaten' : '',
        !hasLocationAssignment ? 'Keine Standortzuordnung' : '',
        !hourlyRate && !employee.monthlySalary ? 'Payroll-Profil unvollstaendig' : '',
        minijobWarning ? 'Minijob-Grenze pruefen' : '',
      ].filter(Boolean);

      return {
        employee: toUserResponse(employee),
        plannedHours,
        actualHours,
        breakHours,
        overtimeHours,
        absenceDays: vacationDays + sickDays + unpaidDays + otherAbsenceDays,
        sickDays,
        vacationDays,
        unpaidDays,
        otherAbsenceDays,
        hourlyRate,
        grossPay,
        laborCost: grossPay,
        minijobWarning,
        warnings,
      };
    });

    return {
      employees: summaries,
      totals: {
        plannedHours: this.sum(summaries, 'plannedHours'),
        actualHours: this.sum(summaries, 'actualHours'),
        breakHours: this.sum(summaries, 'breakHours'),
        overtimeHours: this.sum(summaries, 'overtimeHours'),
        grossPay: this.sum(summaries, 'grossPay'),
        laborCost: this.sum(summaries, 'laborCost'),
        vacationDays: this.sum(summaries, 'vacationDays'),
        sickDays: this.sum(summaries, 'sickDays'),
        unpaidDays: this.sum(summaries, 'unpaidDays'),
        otherAbsenceDays: this.sum(summaries, 'otherAbsenceDays'),
      },
    };
  }

  private async getEmployeeQuery(
    actor: AuthenticatedUser,
    query: PayrollQuery,
  ): Promise<Record<string, unknown>> {
    const scoped = await this.accessPolicy.getManageableUsersFilter(actor);
    if (query.employeeId) {
      scoped._id = query.employeeId;
    }
    if (query.locationId) {
      scoped.$or = [
        { locationId: query.locationId },
        { locationIds: query.locationId },
        { managedLocationIds: query.locationId },
      ];
    }
    return scoped;
  }

  private resolveRange(query: PayrollQuery): { start: Date; end: Date } {
    const now = new Date();
    const start = query.start
      ? new Date(query.start)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = query.end
      ? new Date(query.end)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start.getTime() >= end.getTime()
    ) {
      throw new BadRequestException('Ungueltige Payroll-Periode');
    }

    return { start, end };
  }

  private async ensurePeriod(
    actor: AuthenticatedUser,
    query: PayrollQuery,
    range: { start: Date; end: Date },
  ): Promise<PayrollPeriodDocument> {
    const filter = await this.periodFilter(actor, query, range);
    const existing = await this.payrollPeriodModel.findOne(filter).exec();

    if (existing) {
      return existing;
    }

    return this.payrollPeriodModel.create({
      ...filter,
      status: PayrollPeriodStatus.Open,
      employeeSnapshots: [],
      totalsSnapshot: {},
    });
  }

  private async periodFilter(
    actor: AuthenticatedUser,
    query: PayrollQuery,
    range?: { start: Date; end: Date },
  ): Promise<Record<string, unknown>> {
    if (this.accessPolicy.isPlatformAdmin(actor) || !actor.tenantId) {
      throw new BadRequestException('Payroll benoetigt einen Tenant-Kontext');
    }

    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, query.locationId);
    }

    const filter: Record<string, unknown> = {
      tenantId: actor.tenantId,
      locationId: query.locationId ?? null,
      employeeId: query.employeeId ?? null,
    };

    if (range) {
      filter.start = range.start;
      filter.end = range.end;
    }

    return filter;
  }

  private summaryFromLockedPeriod(
    period: PayrollPeriodDocument,
  ): PayrollSummary {
    const employees = period.employeeSnapshots as unknown as PayrollEmployeeSummary[];
    const totals = this.normalizeTotals(period.totalsSnapshot);
    return {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      period: this.toPeriodResponse(period),
      employees,
      totals,
    };
  }

  private normalizeTotals(value: Record<string, unknown>): PayrollTotals {
    return {
      plannedHours: this.numberFrom(value.plannedHours),
      actualHours: this.numberFrom(value.actualHours),
      breakHours: this.numberFrom(value.breakHours),
      overtimeHours: this.numberFrom(value.overtimeHours),
      grossPay: this.numberFrom(value.grossPay ?? value.laborCost),
      laborCost: this.numberFrom(value.laborCost ?? value.grossPay),
      vacationDays: this.numberFrom(value.vacationDays),
      sickDays: this.numberFrom(value.sickDays),
      unpaidDays: this.numberFrom(value.unpaidDays),
      otherAbsenceDays: this.numberFrom(value.otherAbsenceDays),
    };
  }

  private toPeriodResponse(
    period: PayrollPeriodDocument,
  ): PayrollPeriodResponse {
    return {
      _id: period._id.toString(),
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      locationId: period.locationId || undefined,
      employeeId: period.employeeId || undefined,
      status: period.status,
      lockedAt: period.lockedAt?.toISOString(),
      lockedByUserId: period.lockedByUserId,
    };
  }

  private hoursBetween(start: Date, end: Date): number {
    return Math.max(0, end.getTime() - start.getTime()) / 3_600_000;
  }

  private monthlyToHourly(monthlySalary?: number): number {
    return monthlySalary ? monthlySalary / 173.33 : 0;
  }

  private countAbsenceDays(
    absences: StaffAbsence[],
    type: StaffAbsenceType,
  ): number {
    return absences
      .filter((absence) => absence.type === type)
      .reduce((sum, absence) => {
        const days =
          Math.ceil(
            (absence.endDate.getTime() - absence.startDate.getTime()) /
              86_400_000,
          ) + 1;
        return sum + Math.max(1, days);
      }, 0);
  }

  private sum(
    summaries: PayrollEmployeeSummary[],
    key: keyof PayrollEmployeeSummary,
  ): number {
    return this.roundMoney(
      summaries.reduce((total, item) => {
        const value = item[key];
        return total + (typeof value === 'number' ? value : 0);
      }, 0),
    );
  }

  private roundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private numberFrom(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private toCsv(rows: unknown[][]): string {
    return rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'),
      )
      .join('\n');
  }

  private toExcelXml(rows: unknown[][]): string {
    const body = rows
      .map(
        (row) =>
          `<Row>${row
            .map(
              (cell) =>
                `<Cell><Data ss:Type="${
                  typeof cell === 'number' ? 'Number' : 'String'
                }">${String(cell)
                  .replaceAll('&', '&amp;')
                  .replaceAll('<', '&lt;')
                  .replaceAll('>', '&gt;')}</Data></Cell>`,
            )
            .join('')}</Row>`,
      )
      .join('');

    return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Payroll"><Table>${body}</Table></Worksheet>
</Workbook>`;
  }
}
