import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { UpdateDashboardPreferencesDto } from './dto/update-dashboard-preferences.dto';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardPreference } from './schemas/dashboard-preference.schema';
import { DashboardNotification } from './schemas/notification.schema';

@Injectable()
export class DashboardService {
  constructor(
    private readonly analytics: DashboardAnalyticsService,
    @InjectModel(DashboardPreference.name)
    private readonly preferenceModel: Model<DashboardPreference>,
    @InjectModel(DashboardNotification.name)
    private readonly notificationModel: Model<DashboardNotification>,
  ) {}

  overview(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getOverview(user, query);
  }

  sales(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getSales(user, query);
  }

  orders(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getOrders(user, query);
  }

  inventory(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getInventory(user, query);
  }

  reservations(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getReservations(user, query);
  }

  employees(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getEmployees(user, query);
  }

  finance(user: AuthenticatedUser, query: DashboardQueryDto) {
    return this.analytics.getFinance(user, query);
  }

  async notifications(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.analytics.resolveQuery(user, query);
    const storedFilter: Record<string, unknown> = { userId: user.sub };

    if (resolved.locationId) {
      storedFilter.$or = [
        { locationId: resolved.locationId },
        { locationId: { $exists: false } },
      ];
    }

    const [stored, generated] = await Promise.all([
      this.notificationModel
        .find(storedFilter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      this.analytics.alerts(user, resolved),
    ]);

    return {
      stored,
      generated,
      unread: stored.filter((item) => !item.read).length,
    };
  }

  async updatePreferences(
    user: AuthenticatedUser,
    payload: UpdateDashboardPreferencesDto,
  ) {
    const preference = await this.preferenceModel
      .findOneAndUpdate(
        { userId: user.sub },
        { $set: { ...payload, userId: user.sub } },
        { returnDocument: 'after', upsert: true },
      )
      .lean();

    return preference;
  }

  async export(user: AuthenticatedUser, query: DashboardQueryDto) {
    const [overview, sales, finance] = await Promise.all([
      this.analytics.getOverview(user, query),
      this.analytics.getSales(user, query),
      this.analytics.getFinance(user, query),
    ]);
    const lines = [
      ['Bereich', 'Kennzahl', 'Wert'],
      ['Umsatz', 'Heute', overview.kpis.revenueToday],
      ['Umsatz', 'Zeitraum', finance.rangeRevenue],
      ['Umsatz', 'Deckungsbeitrag', finance.contributionMargin],
      ['Bestellungen', 'Heute', overview.kpis.ordersToday],
      ['Bestellungen', 'Offen', overview.kpis.openOrders],
      ['Reservierungen', 'Heute', overview.kpis.reservationsToday],
      ['Inventar', 'Warenwert', overview.kpis.inventoryValue],
      ['Inventar', 'Mindestbestand', overview.kpis.lowStockItems],
      ['Zeitreihe', 'Datenpunkte', sales.timeline.length],
    ];

    return {
      filename: `gastromania-dashboard-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: lines
        .map((row) => row.map((value) => this.csvCell(value)).join(';'))
        .join('\n'),
    };
  }

  private csvCell(value: string | number | boolean | null | undefined) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }
}
