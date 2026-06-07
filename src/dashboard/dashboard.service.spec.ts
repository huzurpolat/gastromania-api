import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardService } from './dashboard.service';
import { DashboardPreference } from './schemas/dashboard-preference.schema';
import { DashboardNotification } from './schemas/notification.schema';

describe('DashboardService', () => {
  let service: DashboardService;
  const user = {
    sub: 'user-1',
    email: 'admin@test.local',
    roles: ['Admin'],
    permissions: ['dashboard.view', 'reports.export'],
  };
  const analytics = {
    getOverview: jest.fn(),
    getSales: jest.fn(),
    getFinance: jest.fn(),
    resolveQuery: jest.fn(),
    alerts: jest.fn(),
  };
  const preferenceModel = {
    findOneAndUpdate: jest.fn(),
  };
  const notificationModel = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardAnalyticsService, useValue: analytics },
        {
          provide: getModelToken(DashboardPreference.name),
          useValue: preferenceModel,
        },
        {
          provide: getModelToken(DashboardNotification.name),
          useValue: notificationModel,
        },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('stores user specific dashboard preferences', async () => {
    const saved = { userId: 'user-1', defaultRange: '7d' };
    preferenceModel.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue(saved),
    });

    await expect(
      service.updatePreferences(user, { defaultRange: '7d' }),
    ).resolves.toBe(saved);
    expect(preferenceModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { $set: { userId: 'user-1', defaultRange: '7d' } },
      { returnDocument: 'after', upsert: true },
    );
  });

  it('combines stored notifications with live alerts', async () => {
    analytics.resolveQuery.mockReturnValue({
      range: 'today',
      from: new Date(),
      to: new Date(),
    });
    analytics.alerts.mockResolvedValue([
      { id: 'stock-1', title: 'Bestand', severity: 'warning' },
    ]);
    notificationModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([{ read: false, title: 'Gespeichert' }]),
    });

    const result = await service.notifications(user, {});

    expect(result.unread).toBe(1);
    expect(result.generated).toHaveLength(1);
    expect(result.stored).toHaveLength(1);
  });

  it('exports dashboard KPIs as CSV content', async () => {
    analytics.getOverview.mockResolvedValue({
      kpis: {
        revenueToday: 120,
        ordersToday: 3,
        openOrders: 1,
        reservationsToday: 2,
        inventoryValue: 500,
        lowStockItems: 4,
      },
    });
    analytics.getSales.mockResolvedValue({ timeline: [{ _id: '10:00' }] });
    analytics.getFinance.mockResolvedValue({
      rangeRevenue: 900,
      contributionMargin: 650,
    });

    const exported = await service.export(user, { range: 'today' });

    expect(exported.filename).toContain('gastromania-dashboard');
    expect(exported.content).toContain('"Umsatz";"Heute";"120"');
  });
});
