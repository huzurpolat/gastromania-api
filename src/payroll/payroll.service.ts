import { Injectable } from '@nestjs/common';
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
  hourlyRate: number;
  laborCost: number;
  minijobWarning: boolean;
}

export interface PayrollSummary {
  start: string;
  end: string;
  employees: PayrollEmployeeSummary[];
  totals: {
    plannedHours: number;
    actualHours: number;
    breakHours: number;
    overtimeHours: number;
    laborCost: number;
    vacationDays: number;
    sickDays: number;
  };
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
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async summary(
    actor: AuthenticatedUser,
    query: PayrollQuery = {},
  ): Promise<PayrollSummary> {
    const range = this.resolveRange(query);
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
          (sum, entry) => sum + entry.breakMinutes / 60,
          0,
        ),
      );
      const actualHours = this.roundHours(
        employeeEntries.reduce(
          (sum, entry) =>
            sum +
            Math.max(
              0,
              this.hoursBetween(entry.clockIn, entry.clockOut ?? new Date()) -
                entry.breakMinutes / 60,
            ),
          0,
        ),
      );
      const overtimeHours = this.roundHours(actualHours - plannedHours);
      const hourlyRate =
        employee.hourlyRate ?? this.monthlyToHourly(employee.monthlySalary);
      const laborCost = this.roundMoney(actualHours * hourlyRate);
      const vacationDays = this.countAbsenceDays(
        employeeAbsences,
        StaffAbsenceType.Vacation,
      );
      const sickDays = this.countAbsenceDays(
        employeeAbsences,
        StaffAbsenceType.Sick,
      );

      return {
        employee: toUserResponse(employee),
        plannedHours,
        actualHours,
        breakHours,
        overtimeHours,
        absenceDays: vacationDays + sickDays,
        sickDays,
        vacationDays,
        hourlyRate,
        laborCost,
        minijobWarning:
          employee.contractType === 'Minijob' && laborCost >= 538 * 0.9,
      };
    });

    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      employees: summaries,
      totals: {
        plannedHours: this.sum(summaries, 'plannedHours'),
        actualHours: this.sum(summaries, 'actualHours'),
        breakHours: this.sum(summaries, 'breakHours'),
        overtimeHours: this.sum(summaries, 'overtimeHours'),
        laborCost: this.sum(summaries, 'laborCost'),
        vacationDays: this.sum(summaries, 'vacationDays'),
        sickDays: this.sum(summaries, 'sickDays'),
      },
    };
  }

  async export(
    actor: AuthenticatedUser,
    query: PayrollQuery & { format?: 'csv' | 'xlsx' } = {},
  ) {
    const summary = await this.summary(actor, query);
    const rows = [
      [
        'Personalnummer',
        'Name',
        'Vertragsart',
        'Sollstunden',
        'Iststunden',
        'Pausen',
        'Überstunden',
        'Urlaubstage',
        'Krankheitstage',
        'Personalkosten',
        'Minijob-Warnung',
      ],
      ...summary.employees.map((item) => [
        item.employee.employeeNumber ?? '',
        item.employee.name,
        item.employee.contractType ?? '',
        item.plannedHours,
        item.actualHours,
        item.breakHours,
        item.overtimeHours,
        item.vacationDays,
        item.sickDays,
        item.laborCost,
        item.minijobWarning ? 'ja' : 'nein',
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
    return { start, end };
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
                `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${String(
                  cell,
                )
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
