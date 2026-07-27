import { Role } from '../auth/enums/role.enum';
import { ExecutiveDashboardService } from './executive-dashboard.service';

describe('ExecutiveDashboardService', () => {
  const actor = {
    sub: 'tenant-admin',
    email: 'admin@tenant.local',
    roles: [Role.TenantAdmin],
    permissions: ['reports.view'],
    tenantId: 'tenant-1',
  };

  it('builds executive score, KPIs, risks and management summary from benchmarking', async () => {
    const benchmarkingService = {
      getBenchmarking: jest.fn().mockResolvedValue({
        generatedAt: '2026-06-12T00:00:00Z',
        period: {
          mode: 'week',
          dateFrom: '2026-06-08T00:00:00Z',
          dateTo: '2026-06-15T00:00:00Z',
          week: 24,
          year: 2026,
        },
        formula: 'Benchmark Score = ...',
        summary: {
          bestLocation: {
            id: 'loc-1',
            name: 'Koeln',
            score: 82,
            revenue: 12000,
            forecastAccuracy: 90,
          },
          weakestLocation: null,
          bestArea: { id: 'area-1', name: 'NRW', score: 76 },
          bestRegion: { id: 'region-1', name: 'Rheinland', score: 78 },
          averageScore: 74,
          locationCount: 2,
          areaCount: 1,
          regionCount: 1,
        },
        locations: [
          {
            id: 'loc-1',
            name: 'Koeln',
            score: 82,
            previousScore: 75,
            scoreChange: 7,
            trend: 'UP',
            badge: 'TOP_PERFORMER',
            revenue: 12000,
            previousRevenue: 10000,
            revenueChangePercent: 20,
            laborCost: 2600,
            laborCostPercentage: 21.67,
            revenuePerHour: 80,
            forecastAccuracy: 90,
            plannedHours: 140,
            actualHours: 150,
            overtimeHours: 2,
            overtimeRate: 1.33,
            underStaffingHours: 0,
            overStaffingHours: 0,
          },
          {
            id: 'loc-2',
            name: 'Bonn',
            score: 48,
            previousScore: 60,
            scoreChange: -12,
            trend: 'DOWN',
            badge: 'NEEDS_ATTENTION',
            revenue: 7000,
            previousRevenue: 9000,
            revenueChangePercent: -22.22,
            laborCost: 3200,
            laborCostPercentage: 45.71,
            revenuePerHour: 46.67,
            forecastAccuracy: 55,
            plannedHours: 100,
            actualHours: 150,
            overtimeHours: 40,
            overtimeRate: 26.67,
            underStaffingHours: 8,
            overStaffingHours: 0,
          },
        ],
        regions: [{ id: 'region-1', name: 'Rheinland', score: 78, previousScore: 70, scoreChange: 8, trend: 'UP', badge: 'AVERAGE' }],
        areas: [{ id: 'area-1', name: 'NRW', score: 76, previousScore: 72, scoreChange: 4, trend: 'UP', badge: 'AVERAGE' }],
        rankings: {},
        filters: {},
      }),
    };
    const service = new ExecutiveDashboardService(benchmarkingService as never);

    const result = await service.getExecutiveDashboard(actor as never, {
      period: 'week',
      week: 24,
      year: 2026,
    });

    expect(benchmarkingService.getBenchmarking).toHaveBeenCalledWith(actor, {
      period: 'week',
      week: 24,
      year: 2026,
    });
    expect(result.kpis.revenue.current).toBe(19000);
    expect(result.kpis.revenue.changePercent).toBe(0);
    expect(result.executiveScore.value).toBeGreaterThan(0);
    expect(result.risks.some((risk) => risk.type === 'HIGH_LABOR_COST')).toBe(true);
    expect(result.risks.some((risk) => risk.type === 'LOW_FORECAST_ACCURACY')).toBe(true);
    expect(result.summary.text).toContain('Executive Score');
  });
});
