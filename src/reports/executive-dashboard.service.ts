import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  BenchmarkRow,
  BenchmarkingService,
} from './benchmarking.service';
import { BenchmarkingQueryDto } from './dto/benchmarking-query.dto';

type BenchmarkingResult = Awaited<
  ReturnType<BenchmarkingService['getBenchmarking']>
>;
type RiskSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
type ExecutiveClassification =
  | 'WELTKLASSE'
  | 'SEHR_GUT'
  | 'STABIL'
  | 'AUFMERKSAMKEIT'
  | 'KRITISCH';

interface ExecutiveRisk {
  type:
    | 'HIGH_LABOR_COST'
    | 'HIGH_OVERTIME'
    | 'LOW_FORECAST_ACCURACY'
    | 'UNDERSTAFFED'
    | 'REVENUE_DECLINE';
  severity: RiskSeverity;
  message: string;
  locationId?: string;
  locationName?: string;
  value: number;
}

@Injectable()
export class ExecutiveDashboardService {
  constructor(private readonly benchmarkingService: BenchmarkingService) {}

  async getExecutiveDashboard(
    actor: AuthenticatedUser,
    query: BenchmarkingQueryDto,
  ) {
    const benchmark = await this.benchmarkingService.getBenchmarking(actor, query);
    const locations = benchmark.locations;
    const kpis = this.kpis(locations, benchmark.summary.averageScore);
    const executiveScore = this.executiveScore(kpis);
    const risks = this.risks(locations, kpis);
    const topPerformers = {
      location: benchmark.summary.bestLocation,
      region: benchmark.summary.bestRegion,
      area: benchmark.summary.bestArea,
    };
    const trends = {
      locations: this.trendRows(benchmark.locations),
      regions: this.trendRows(benchmark.regions),
      areas: this.trendRows(benchmark.areas),
    };

    return {
      generatedAt: new Date().toISOString(),
      period: benchmark.period,
      executiveScore,
      kpis,
      topPerformers,
      risks,
      trends,
      summary: {
        text: this.managementSummary(benchmark, kpis, executiveScore, risks),
        benchmarkFormula: benchmark.formula,
        executiveFormula:
          'Executive Score = 40% Benchmark Score + 25% Forecast Accuracy + 20% Personalkostenquote + 15% Umsatzentwicklung.',
      },
    };
  }

  private kpis(locations: BenchmarkRow[], averageBenchmarkScore: number) {
    const revenue = this.sum(locations, (row) => row.revenue);
    const previousRevenue = this.sum(locations, (row) => row.previousRevenue);
    const laborCost = this.sum(locations, (row) => row.laborCost);
    const actualHours = this.sum(locations, (row) => row.actualHours);
    const forecastAccuracy = this.average(
      locations
        .map((row) => row.forecastAccuracy)
        .filter((value): value is number => value !== null),
    );
    return {
      revenue: {
        current: this.roundMoney(revenue),
        previous: this.roundMoney(previousRevenue),
        changePercent: previousRevenue > 0
          ? this.roundHours(((revenue - previousRevenue) / previousRevenue) * 100)
          : 0,
      },
      laborCostPercentage: {
        current: revenue > 0 ? this.roundHours((laborCost / revenue) * 100) : 0,
        previous: null,
      },
      forecastAccuracy: {
        current: forecastAccuracy || null,
        previous: null,
      },
      revenuePerLaborHour: {
        current: actualHours > 0 ? this.roundMoney(revenue / actualHours) : 0,
        previous: null,
      },
      benchmarkScoreAverage: {
        current: averageBenchmarkScore,
        previous: this.roundHours(this.average(locations.map((row) => row.previousScore))),
        change: this.roundHours(this.average(locations.map((row) => row.scoreChange))),
      },
    };
  }

  private executiveScore(kpis: ReturnType<ExecutiveDashboardService['kpis']>) {
    const benchmarkScore = kpis.benchmarkScoreAverage.current;
    const forecastScore = kpis.forecastAccuracy.current ?? 50;
    const laborCostScore = this.clamp(
      100 - Math.max(0, kpis.laborCostPercentage.current - 18) * 4,
      0,
      100,
    );
    const revenueDevelopmentScore = this.clamp(
      50 + kpis.revenue.changePercent,
      0,
      100,
    );
    const value = this.roundHours(
      benchmarkScore * 0.4 +
        forecastScore * 0.25 +
        laborCostScore * 0.2 +
        revenueDevelopmentScore * 0.15,
    );
    return {
      value,
      classification: this.executiveClassification(value),
      components: {
        benchmarkScore,
        forecastAccuracy: forecastScore,
        laborCostScore: this.roundHours(laborCostScore),
        revenueDevelopmentScore: this.roundHours(revenueDevelopmentScore),
      },
    };
  }

  private risks(
    locations: BenchmarkRow[],
    kpis: ReturnType<ExecutiveDashboardService['kpis']>,
  ): ExecutiveRisk[] {
    const risks: ExecutiveRisk[] = [];
    if (kpis.laborCostPercentage.current >= 40) {
      risks.push({
        type: 'HIGH_LABOR_COST',
        severity: 'CRITICAL',
        message: `Personalkostenquote liegt bei ${kpis.laborCostPercentage.current}%.`,
        value: kpis.laborCostPercentage.current,
      });
    } else if (kpis.laborCostPercentage.current >= 30) {
      risks.push({
        type: 'HIGH_LABOR_COST',
        severity: 'WARNING',
        message: `Personalkostenquote liegt bei ${kpis.laborCostPercentage.current}%.`,
        value: kpis.laborCostPercentage.current,
      });
    }
    if (kpis.revenue.changePercent <= -10) {
      risks.push({
        type: 'REVENUE_DECLINE',
        severity: 'CRITICAL',
        message: `Umsatz ist gegenueber der Vorperiode um ${Math.abs(kpis.revenue.changePercent)}% gefallen.`,
        value: kpis.revenue.changePercent,
      });
    } else if (kpis.revenue.changePercent < 0) {
      risks.push({
        type: 'REVENUE_DECLINE',
        severity: 'WARNING',
        message: `Umsatz ist gegenueber der Vorperiode um ${Math.abs(kpis.revenue.changePercent)}% gefallen.`,
        value: kpis.revenue.changePercent,
      });
    }
    for (const row of locations) {
      if ((row.forecastAccuracy ?? 100) < 70) {
        risks.push({
          type: 'LOW_FORECAST_ACCURACY',
          severity: (row.forecastAccuracy ?? 0) < 50 ? 'CRITICAL' : 'WARNING',
          message: `${row.name}: Forecast Accuracy liegt bei ${row.forecastAccuracy}%.`,
          locationId: row.id,
          locationName: row.name,
          value: row.forecastAccuracy ?? 0,
        });
      }
      if (row.overtimeRate >= 15) {
        risks.push({
          type: 'HIGH_OVERTIME',
          severity: row.overtimeRate >= 25 ? 'CRITICAL' : 'WARNING',
          message: `${row.name}: Ueberstundenquote liegt bei ${row.overtimeRate}%.`,
          locationId: row.id,
          locationName: row.name,
          value: row.overtimeRate,
        });
      }
      if (row.underStaffingHours >= 4) {
        risks.push({
          type: 'UNDERSTAFFED',
          severity: row.underStaffingHours >= 8 ? 'CRITICAL' : 'WARNING',
          message: `${row.name}: ${row.underStaffingHours} Stunden Unterbesetzung.`,
          locationId: row.id,
          locationName: row.name,
          value: row.underStaffingHours,
        });
      }
    }
    if (!risks.length) {
      risks.push({
        type: 'HIGH_LABOR_COST',
        severity: 'INFO',
        message: 'Keine kritischen Management-Risiken im gewaehlten Zeitraum erkannt.',
        value: 0,
      });
    }
    return risks.sort((first, second) => this.severityRank(second.severity) - this.severityRank(first.severity));
  }

  private managementSummary(
    benchmark: BenchmarkingResult,
    kpis: ReturnType<ExecutiveDashboardService['kpis']>,
    executiveScore: ReturnType<ExecutiveDashboardService['executiveScore']>,
    risks: ExecutiveRisk[],
  ): string {
    const revenueVerb = kpis.revenue.changePercent >= 0 ? 'stieg' : 'fiel';
    const revenueText = `Der Umsatz ${revenueVerb} um ${Math.abs(kpis.revenue.changePercent)}% gegenueber der Vorperiode.`;
    const laborText = `Die durchschnittliche Personalkostenquote liegt bei ${kpis.laborCostPercentage.current}%.`;
    const bestLocation = benchmark.summary.bestLocation
      ? `${benchmark.summary.bestLocation.name} ist aktuell bester Standort mit ${benchmark.summary.bestLocation.score} Punkten.`
      : 'Es liegt noch kein bester Standort vor.';
    const riskText = risks.find((risk) => risk.severity !== 'INFO')?.message ?? 'Aktuell wurden keine kritischen Risiken erkannt.';
    return `${revenueText} ${laborText} ${bestLocation} Executive Score: ${executiveScore.value} (${executiveScore.classification}). ${riskText}`;
  }

  private trendRows(rows: BenchmarkRow[]) {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      score: row.score,
      previousScore: row.previousScore,
      scoreChange: row.scoreChange,
      trend: row.trend,
      badge: row.badge,
    }));
  }

  private executiveClassification(value: number): ExecutiveClassification {
    if (value >= 90) return 'WELTKLASSE';
    if (value >= 75) return 'SEHR_GUT';
    if (value >= 60) return 'STABIL';
    if (value >= 40) return 'AUFMERKSAMKEIT';
    return 'KRITISCH';
  }

  private severityRank(severity: RiskSeverity): number {
    if (severity === 'CRITICAL') return 3;
    if (severity === 'WARNING') return 2;
    return 1;
  }

  private sum(rows: BenchmarkRow[], valueFor: (row: BenchmarkRow) => number): number {
    return rows.reduce((sum, row) => sum + valueFor(row), 0);
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    return this.roundHours(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private roundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
