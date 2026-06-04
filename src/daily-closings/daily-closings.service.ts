import {
  BadRequestException,
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
  Checklist,
  ChecklistStatus,
} from '../checklists/schemas/checklist.schema';
import {
  DashboardNotification,
  DashboardNotificationSeverity,
} from '../dashboard/schemas/notification.schema';
import { Location } from '../locations/schemas/location.schema';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { StockItem } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import {
  CompleteDailyClosingDto,
  GenerateDailyClosingDto,
  LockDailyClosingDto,
  ReopenDailyClosingDto,
  UpdateDailyClosingDto,
} from './dto/daily-closing.dto';
import {
  DailyClosing,
  DailyClosingDocument,
  DailyClosingStatus,
} from './schemas/daily-closing.schema';

interface ClosingDayRange {
  from: Date;
  to: Date;
  businessDate: Date;
}

@Injectable()
export class DailyClosingsService {
  constructor(
    @InjectModel(DailyClosing.name)
    private readonly dailyClosingModel: Model<DailyClosingDocument>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovement>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItem>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<Checklist>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTable>,
    @InjectModel(DashboardNotification.name)
    private readonly notificationModel: Model<DashboardNotification>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async findAll(
    actor: AuthenticatedUser,
    query: { locationId?: string; date?: string; status?: DailyClosingStatus },
  ) {
    this.assertCanView(actor);
    const filter = await this.resolveClosingFilter(actor, query.locationId);

    if (query.date) {
      filter.businessDate = this.resolveDay(query.date).businessDate;
    }

    if (query.status) {
      filter.status = query.status;
    }

    return this.dailyClosingModel
      .find(filter)
      .sort({ businessDate: -1, createdAt: -1 })
      .lean();
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.assertCanView(actor);
    const closing = await this.dailyClosingModel.findById(id).lean();

    if (!closing) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }

    await this.accessPolicy.assertCanAccessLocation(actor, closing.locationId);
    return closing;
  }

  async findByLocationAndDate(
    actor: AuthenticatedUser,
    locationId: string,
    date: string,
  ) {
    this.assertCanView(actor);
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    const { businessDate } = this.resolveDay(date);
    const closing = await this.dailyClosingModel
      .findOne({ locationId, businessDate })
      .lean();

    if (!closing) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }

    return closing;
  }

  async generate(dto: GenerateDailyClosingDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    await this.accessPolicy.assertCanManageLocation(actor, dto.locationId);
    const location = await this.locationModel.findById(dto.locationId).lean();

    if (!location) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    const range = this.resolveDay(dto.businessDate);
    const snapshot = await this.buildSnapshot(dto.locationId, range);
    const existing = await this.dailyClosingModel.findOne({
      locationId: dto.locationId,
      businessDate: range.businessDate,
    });
    const previousStatus = existing?.status;
    const payload = {
      companyId: location.companyId,
      regionId: location.regionId,
      locationId: dto.locationId,
      businessDate: range.businessDate,
      status:
        existing?.status && existing.status !== DailyClosingStatus.Draft
          ? existing.status
          : DailyClosingStatus.ReadyForReview,
      createdBy: existing?.createdBy ?? actor.sub,
      ...snapshot,
    };
    const audit = this.audit(
      actor,
      dto.locationId,
      'generated',
      previousStatus,
      payload.status,
    );
    const statusHistory =
      previousStatus && previousStatus !== payload.status
        ? [
            this.statusHistory(
              actor,
              previousStatus,
              payload.status,
              'Systemdaten neu geladen',
            ),
          ]
        : [];

    const closing = await this.dailyClosingModel
      .findOneAndUpdate(
        { locationId: dto.locationId, businessDate: range.businessDate },
        {
          $set: payload,
          $push: {
            activityLog: audit,
            ...(statusHistory.length
              ? { statusHistory: { $each: statusHistory } }
              : {}),
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .lean();

    await this.notify(
      actor,
      closing,
      'Tagesabschluss vorbereitet',
      'Der Tagesabschluss wurde generiert.',
      DashboardNotificationSeverity.Info,
    );
    return closing;
  }

  async update(
    id: string,
    dto: UpdateDailyClosingDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    const closing = await this.getEditableClosing(id, actor);
    const paymentSummary = {
      ...closing.paymentSummary,
      countedCash: dto.countedCash ?? closing.paymentSummary.countedCash ?? 0,
      differenceNote:
        dto.differenceNote ?? closing.paymentSummary.differenceNote,
    };
    paymentSummary.cashDifference =
      Number(paymentSummary.countedCash ?? 0) -
      Number(paymentSummary.expectedCash ?? 0);

    return this.dailyClosingModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            paymentSummary,
            note: dto.note ?? closing.note,
            issueNote: dto.issueNote ?? closing.issueNote,
          },
          $push: {
            activityLog: this.audit(
              actor,
              closing.locationId,
              'updated',
              closing.status,
              closing.status,
              dto.note ?? dto.differenceNote ?? dto.issueNote,
            ),
          },
        },
        { new: true, runValidators: true },
      )
      .lean();
  }

  async complete(
    id: string,
    dto: CompleteDailyClosingDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    const closing = await this.getEditableClosing(id, actor);
    const paymentSummary = {
      ...closing.paymentSummary,
      countedCash: dto.countedCash ?? closing.paymentSummary.countedCash ?? 0,
      differenceNote:
        dto.differenceNote ?? closing.paymentSummary.differenceNote,
    };
    paymentSummary.cashDifference =
      Number(paymentSummary.countedCash ?? 0) -
      Number(paymentSummary.expectedCash ?? 0);
    const issueList = this.createIssueList({ ...closing, paymentSummary });
    const hasCashPayments = Number(paymentSummary.expectedCash ?? 0) > 0;
    const hasDifference =
      Math.abs(Number(paymentSummary.cashDifference ?? 0)) > 0.009;

    if (
      hasCashPayments &&
      dto.countedCash === undefined &&
      closing.paymentSummary.countedCash === 0
    ) {
      throw new BadRequestException('Barbestand muss gezaehlt werden');
    }

    if (hasDifference && !paymentSummary.differenceNote) {
      throw new BadRequestException(
        'Differenzen muessen mit Pflichtnotiz dokumentiert werden',
      );
    }

    if (issueList.length && !(dto.issueNote ?? closing.issueNote)) {
      throw new BadRequestException(
        'Offene Probleme erfordern eine Tagesnotiz',
      );
    }

    const newStatus =
      issueList.length || hasDifference
        ? DailyClosingStatus.CompletedWithIssues
        : DailyClosingStatus.Completed;
    const updated = await this.dailyClosingModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            paymentSummary,
            issueList,
            status: newStatus,
            note: dto.note ?? closing.note,
            issueNote: dto.issueNote ?? closing.issueNote,
            completedBy: actor.sub,
            completedAt: new Date(),
          },
          $push: {
            activityLog: this.audit(
              actor,
              closing.locationId,
              'completed',
              closing.status,
              newStatus,
              dto.issueNote ?? dto.note,
            ),
            statusHistory: this.statusHistory(
              actor,
              closing.status,
              newStatus,
              dto.issueNote,
            ),
          },
        },
        { new: true, runValidators: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }

    await this.notify(
      actor,
      updated,
      newStatus === DailyClosingStatus.CompletedWithIssues
        ? 'Tagesabschluss mit Problemen'
        : 'Tagesabschluss abgeschlossen',
      newStatus === DailyClosingStatus.CompletedWithIssues
        ? `Der Tagesabschluss enthaelt ${issueList.length} offene Punkte.`
        : 'Der Tagesabschluss wurde abgeschlossen.',
      newStatus === DailyClosingStatus.CompletedWithIssues
        ? DashboardNotificationSeverity.Warning
        : DashboardNotificationSeverity.Success,
    );
    return updated;
  }

  async reopen(
    id: string,
    dto: ReopenDailyClosingDto,
    actor: AuthenticatedUser,
  ) {
    if (
      !hasAnyRole(actor.roles, [
        Role.PlatformAdmin,
        Role.SuperAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung zum Wiedereroeffnen');
    }

    const closing = await this.dailyClosingModel.findById(id).lean();
    if (!closing) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }
    await this.accessPolicy.assertCanManageLocation(actor, closing.locationId);

    const updated = await this.dailyClosingModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: DailyClosingStatus.Reopened,
            reopenedBy: actor.sub,
            reopenedAt: new Date(),
            issueNote: dto.reason,
          },
          $push: {
            activityLog: this.audit(
              actor,
              closing.locationId,
              'reopened',
              closing.status,
              DailyClosingStatus.Reopened,
              dto.reason,
            ),
            statusHistory: this.statusHistory(
              actor,
              closing.status,
              DailyClosingStatus.Reopened,
              dto.reason,
            ),
          },
        },
        { new: true, runValidators: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }

    await this.notify(
      actor,
      updated,
      'Tagesabschluss wieder geoeffnet',
      dto.reason,
      DashboardNotificationSeverity.Warning,
    );
    return updated;
  }

  async lock(id: string, dto: LockDailyClosingDto, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const closing = await this.dailyClosingModel.findById(id).lean();
    if (!closing) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }
    await this.accessPolicy.assertCanManageLocation(actor, closing.locationId);
    if (
      ![
        DailyClosingStatus.Completed,
        DailyClosingStatus.CompletedWithIssues,
      ].includes(closing.status)
    ) {
      throw new BadRequestException(
        'Nur abgeschlossene Tagesabschluesse koennen gesperrt werden',
      );
    }

    return this.dailyClosingModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: DailyClosingStatus.Locked,
            lockedAt: new Date(),
            lockedBy: actor.sub,
          },
          $push: {
            activityLog: this.audit(
              actor,
              closing.locationId,
              'locked',
              closing.status,
              DailyClosingStatus.Locked,
              dto.note,
            ),
            statusHistory: this.statusHistory(
              actor,
              closing.status,
              DailyClosingStatus.Locked,
              dto.note,
            ),
          },
        },
        { new: true, runValidators: true },
      )
      .lean();
  }

  async auditLog(id: string, actor: AuthenticatedUser) {
    const closing = await this.findOne(id, actor);
    return {
      activityLog: closing.activityLog,
      statusHistory: closing.statusHistory,
    };
  }

  private async buildSnapshot(locationId: string, range: ClosingDayRange) {
    const [orders, stockItems, stockMovements, checklists, tables] =
      await Promise.all([
        this.orderModel
          .find({
            locationId,
            createdAt: { $gte: range.from, $lte: range.to },
          })
          .lean(),
        this.stockItemModel.find({ locationId, isArchived: false }).lean(),
        this.stockMovementModel
          .find({
            locationId,
            createdAt: { $gte: range.from, $lte: range.to },
          })
          .lean(),
        this.checklistModel
          .find({ locationId, date: { $gte: range.from, $lte: range.to } })
          .lean(),
        this.tableModel.find({ locationId, isActive: true }).lean(),
      ]);
    const paidOrders = orders.filter((order) => this.isRevenueOrder(order));
    const grossSales = paidOrders.reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0,
    );
    const taxAmount = paidOrders.reduce(
      (sum, order) => sum + Number(order.tax ?? 0),
      0,
    );
    const discountTotal = orders.reduce(
      (sum, order) => sum + Number(order.discountTotal ?? 0),
      0,
    );
    const refundTotal = orders.reduce(
      (sum, order) => sum + Number(order.refundTotal ?? 0),
      0,
    );
    const tipTotal = orders.reduce(
      (sum, order) => sum + Number(order.tipTotal ?? 0),
      0,
    );
    const paymentSummary = this.createPaymentSummary(paidOrders);
    const foodCost = Math.abs(
      stockMovements
        .filter((movement) =>
          [
            StockMovementType.OrderConsumption,
            StockMovementType.OrderQuantityAdjustment,
          ].includes(movement.type),
        )
        .reduce((sum, movement) => sum + Number(movement.valueNet ?? 0), 0),
    );
    const wasteTotal = Math.abs(
      stockMovements
        .filter((movement) =>
          [
            StockMovementType.Shrinkage,
            StockMovementType.Breakage,
            StockMovementType.Loss,
          ].includes(movement.type),
        )
        .reduce((sum, movement) => sum + Number(movement.valueNet ?? 0), 0),
    );
    const spoilageTotal = Math.abs(
      stockMovements
        .filter((movement) => movement.type === StockMovementType.Spoilage)
        .reduce((sum, movement) => sum + Number(movement.valueNet ?? 0), 0),
    );
    const lowStockItems = stockItems.filter(
      (item) => Number(item.quantity ?? 0) <= Number(item.minQuantity ?? 0),
    );
    const negativeStockItems = stockItems.filter(
      (item) => Number(item.quantity ?? 0) < 0,
    );
    const openingChecklists = checklists.filter((checklist) =>
      this.isChecklistKind(checklist, [
        'opening',
        'oeffnung',
        'öffnung',
        'start',
      ]),
    );
    const closingChecklists = checklists.filter((checklist) =>
      this.isChecklistKind(checklist, [
        'closing',
        'schluss',
        'schliess',
        'schließ',
        'ende',
      ]),
    );
    const openChecklistItems = checklists.reduce(
      (sum, checklist) =>
        sum +
        (checklist.tasks ?? []).filter((task) => !task.isDone).length +
        (checklist.status !== ChecklistStatus.Done ? 1 : 0),
      0,
    );
    const blockedChecklistItems = checklists.reduce(
      (sum, checklist) =>
        sum +
        (checklist.tasks ?? []).filter((task) =>
          `${task.title} ${task.note ?? ''}`.toLowerCase().includes('block'),
        ).length,
      0,
    );
    const completedOrders = paidOrders.length;
    const openOrders = orders.filter((order) =>
      this.isOpenCriticalOrder(order),
    ).length;
    const unpaidOrders = orders.filter((order) =>
      [PaymentStatus.Open, PaymentStatus.PartiallyPaid].includes(
        order.paymentStatus ?? PaymentStatus.Open,
      ),
    ).length;
    const cancelledOrders = orders.filter(
      (order) => order.status === OrderStatus.Cancelled,
    ).length;
    const readyButNotServed = orders.filter(
      (order) => order.status === OrderStatus.Ready,
    ).length;
    const tablesStillOccupied = tables.filter((table) =>
      [
        TableStatus.Occupied,
        TableStatus.OccupiedState,
        TableStatus.Ordering,
        TableStatus.OrderSent,
        TableStatus.InPreparation,
        TableStatus.ReadyToPay,
        TableStatus.ReadyToServe,
      ].includes(table.status),
    ).length;
    const margin = grossSales - foodCost;
    const snapshot = {
      salesSummary: {
        grossSales,
        netSales: Math.max(0, grossSales - taxAmount),
        taxAmount,
        orderCount: completedOrders,
        cancelledOrderCount: cancelledOrders,
        discountTotal,
        refundTotal,
        tipTotal,
        averageOrderValue: completedOrders ? grossSales / completedOrders : 0,
      },
      paymentSummary,
      orderSummary: {
        openOrders,
        unpaidOrders,
        cancelledOrders,
        completedOrders,
        readyButNotServed,
        tablesStillOccupied,
      },
      checklistSummary: {
        openingChecklistCompleted:
          openingChecklists.length > 0 &&
          openingChecklists.every(
            (checklist) => checklist.status === ChecklistStatus.Done,
          ),
        closingChecklistCompleted:
          closingChecklists.length > 0 &&
          closingChecklists.every(
            (checklist) => checklist.status === ChecklistStatus.Done,
          ),
        openChecklistItems,
        blockedChecklistItems,
      },
      inventorySummary: {
        lowStockItems: lowStockItems.length,
        negativeStockItems: negativeStockItems.length,
        wasteTotal,
        spoilageTotal,
        inventoryWarnings: [
          ...lowStockItems
            .slice(0, 10)
            .map((item) => `${item.name}: Mindestbestand erreicht`),
          ...negativeStockItems
            .slice(0, 10)
            .map((item) => `${item.name}: negativer Bestand`),
        ],
      },
      marginSummary: {
        foodCost,
        grossMargin: margin,
        marginPercent: grossSales ? (margin / grossSales) * 100 : 0,
        itemsBelowTargetMargin: 0,
      },
    };

    return {
      ...snapshot,
      issueList: this.createIssueList(snapshot),
    };
  }

  private createPaymentSummary(orders: Order[]) {
    const totals = {
      cashTotal: 0,
      cardTotal: 0,
      onlineTotal: 0,
      voucherTotal: 0,
      otherTotal: 0,
    };

    for (const order of orders) {
      const explicitTotal =
        Number(order.cashAmount ?? 0) +
        Number(order.cardAmount ?? 0) +
        Number(order.onlineAmount ?? 0) +
        Number(order.voucherAmount ?? 0) +
        Number(order.otherAmount ?? 0);

      totals.cashTotal += Number(order.cashAmount ?? 0);
      totals.cardTotal += Number(order.cardAmount ?? 0);
      totals.onlineTotal += Number(order.onlineAmount ?? 0);
      totals.voucherTotal += Number(order.voucherAmount ?? 0);
      totals.otherTotal += Number(order.otherAmount ?? 0);

      if (explicitTotal <= 0) {
        const total = Number(order.total ?? 0);
        if (order.paymentMethod === PaymentMethod.Cash) {
          totals.cashTotal += total;
        } else if (order.paymentMethod === PaymentMethod.Card) {
          totals.cardTotal += total;
        } else if (order.paymentMethod === PaymentMethod.Online) {
          totals.onlineTotal += total;
        } else if (order.paymentMethod === PaymentMethod.Voucher) {
          totals.voucherTotal += total;
        } else {
          totals.otherTotal += total;
        }
      }
    }

    return {
      ...totals,
      expectedCash: totals.cashTotal,
      countedCash: 0,
      cashDifference: 0 - totals.cashTotal,
      differenceNote: undefined,
    };
  }

  private createIssueList(
    snapshot: Pick<
      DailyClosing,
      | 'orderSummary'
      | 'checklistSummary'
      | 'inventorySummary'
      | 'paymentSummary'
    >,
  ): string[] {
    const issues: string[] = [];
    if (snapshot.orderSummary.openOrders > 0) {
      issues.push(`${snapshot.orderSummary.openOrders} offene Bestellungen`);
    }
    if (snapshot.orderSummary.unpaidOrders > 0) {
      issues.push(`${snapshot.orderSummary.unpaidOrders} offene Rechnungen`);
    }
    if (snapshot.orderSummary.readyButNotServed > 0) {
      issues.push(
        `${snapshot.orderSummary.readyButNotServed} fertige, nicht ausgegebene Bestellungen`,
      );
    }
    if (snapshot.orderSummary.tablesStillOccupied > 0) {
      issues.push(
        `${snapshot.orderSummary.tablesStillOccupied} Tische noch belegt`,
      );
    }
    if (!snapshot.checklistSummary.closingChecklistCompleted) {
      issues.push('Schliessungscheckliste nicht abgeschlossen');
    }
    if (snapshot.checklistSummary.openChecklistItems > 0) {
      issues.push(
        `${snapshot.checklistSummary.openChecklistItems} offene Checklistenpunkte`,
      );
    }
    if (snapshot.inventorySummary.negativeStockItems > 0) {
      issues.push(
        `${snapshot.inventorySummary.negativeStockItems} negative Lagerbestaende`,
      );
    }
    if (Math.abs(Number(snapshot.paymentSummary.cashDifference ?? 0)) > 0.009) {
      issues.push('Bardifferenz vorhanden');
    }

    return [...new Set(issues)];
  }

  private async resolveClosingFilter(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<Record<string, unknown>> {
    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
      return { locationId };
    }

    if (this.accessPolicy.isPlatformAdmin(actor)) {
      return {};
    }

    return {
      locationId: {
        $in: await this.accessPolicy.getReadableLocationIds(actor),
      },
    };
  }

  private async getEditableClosing(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<DailyClosingDocument> {
    const closing = await this.dailyClosingModel.findById(id);
    if (!closing) {
      throw new NotFoundException('Tagesabschluss nicht gefunden');
    }
    await this.accessPolicy.assertCanManageLocation(actor, closing.locationId);
    if (closing.status === DailyClosingStatus.Locked) {
      throw new BadRequestException(
        'Gesperrte Tagesabschluesse koennen nicht bearbeitet werden',
      );
    }

    return closing;
  }

  private isRevenueOrder(
    order: Pick<Order, 'status' | 'paymentStatus'>,
  ): boolean {
    return (
      order.status !== OrderStatus.Cancelled &&
      (order.paymentStatus === PaymentStatus.Paid ||
        [OrderStatus.Closed, OrderStatus.Served].includes(order.status))
    );
  }

  private isOpenCriticalOrder(
    order: Pick<Order, 'status' | 'paymentStatus'>,
  ): boolean {
    return (
      order.status !== OrderStatus.Cancelled &&
      order.status !== OrderStatus.Closed &&
      order.paymentStatus !== PaymentStatus.Paid
    );
  }

  private isChecklistKind(checklist: Checklist, needles: string[]): boolean {
    const haystack =
      `${checklist.title} ${checklist.templateKey ?? ''} ${checklist.area}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  }

  private resolveDay(value: string): ClosingDayRange {
    const businessDate = new Date(value);
    businessDate.setHours(0, 0, 0, 0);
    const from = new Date(businessDate);
    const to = new Date(businessDate);
    to.setHours(23, 59, 59, 999);
    return { from, to, businessDate };
  }

  private assertCanView(actor: AuthenticatedUser): void {
    if (
      !hasAnyRole(actor.roles, [
        Role.PlatformAdmin,
        Role.SuperAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer Tagesabschluesse');
    }
  }

  private assertCanManage(actor: AuthenticatedUser): void {
    if (
      !hasAnyRole(actor.roles, [
        Role.PlatformAdmin,
        Role.SuperAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung fuer Tagesabschluesse');
    }
  }

  private audit(
    actor: AuthenticatedUser,
    locationId: string,
    action: string,
    previousStatus?: string,
    newStatus?: string,
    note?: string,
  ) {
    return {
      userId: actor.sub,
      roles: actor.roles ?? [],
      action,
      previousStatus,
      newStatus,
      timestamp: new Date(),
      locationId,
      note,
    };
  }

  private statusHistory(
    actor: AuthenticatedUser,
    previousStatus: string | undefined,
    newStatus: string,
    note?: string,
  ) {
    return {
      previousStatus,
      newStatus,
      changedBy: actor.sub,
      changedAt: new Date(),
      note,
    };
  }

  private async notify(
    actor: AuthenticatedUser,
    closing: DailyClosing,
    title: string,
    message: string,
    severity: DashboardNotificationSeverity,
  ) {
    await this.notificationModel.create({
      userId: actor.sub,
      locationId: closing.locationId,
      title,
      message,
      severity,
      source: 'daily-closing',
      referenceId: this.stringifyId(
        (closing as DailyClosing & { _id?: unknown })._id,
      ),
      read: false,
    });
  }

  private stringifyId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      value.toString !== Object.prototype.toString
    ) {
      return (value as { toString: () => string }).toString();
    }

    return '';
  }
}
