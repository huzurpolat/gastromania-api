import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AddressInfo } from 'node:net';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { StockItem, StockItemDocument } from './schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from './schemas/stock-movement.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';
import {
  InventoryBatch,
  InventoryBatchDocument,
} from './schemas/inventory-batch.schema';

interface ApiResult<T> {
  status: number;
  body: T;
}

interface LoginBody {
  accessToken: string;
  user: {
    _id: string;
    email: string;
    tenantId?: string;
  };
}

interface SupplierBody {
  _id: string;
  locationId: string;
  name: string;
}

interface StockItemBody {
  _id: string;
  tenantId?: string;
  locationId: string;
  name: string;
  quantity: number;
  purchasePriceNet: number;
  lastPurchasePrice: number;
  averageCost: number;
  averagePurchasePrice: number;
  stockValueNet: number;
  currency: string;
  supplierPrices: SupplierPriceBody[];
  preferredSupplierPrice?: SupplierPriceBody;
  cheapestSupplierPrice?: SupplierPriceBody;
  supplierPriceDifferenceNet?: number;
}

interface SupplierPriceBody {
  supplierId: string;
  supplierName?: string;
  unitPriceNet: number;
  currency: string;
  unit: string;
  isPreferred: boolean;
  lastPurchasedAt?: string;
  lastPurchasePriceNet?: number;
}

interface PurchaseOrderBody {
  _id: string;
  tenantId?: string;
  locationId: string;
  supplierId: string;
  supplierName: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  totalNet: number;
  expectedDeliveryDate?: string;
  lines: Array<{
    _id: string;
    stockItemId: string;
    stockItemName: string;
    quantity: number;
    unit: string;
    expectedUnitCost: number;
    receivedQuantity: number;
    openQuantity: number;
  }>;
}

interface ReorderSuggestionsBody {
  summary: {
    totalItems: number;
    suggestedItems: number;
    coveredItems: number;
    warningCount: number;
    estimatedTotalNet: number;
  };
  items: Array<{
    stockItemId: string;
    stockItemName: string;
    currentStock: number;
    minimumStock: number;
    targetStock?: number;
    unit: string;
    openPurchaseQuantity: number;
    suggestedQuantity: number;
    supplierId?: string;
    supplierName?: string;
    unitPriceNet?: number;
    estimatedTotalNet?: number;
    warnings: string[];
  }>;
}

interface ProcurementDashboardBody {
  summary: {
    openOrders: number;
    overdueOrders: number;
    receiptsToday: number;
    criticalStockItems: number;
    reorderSuggestions: number;
    openOrderValueNet: number;
  };
  purchaseOrders: Array<PurchaseOrderBody & { isOverdue: boolean; openQuantity: number }>;
  receipts: Array<{
    _id: string;
    referenceId?: string;
    stockItemId: string;
    stockItemName: string;
    quantityChange: number;
    valueNet: number;
  }>;
  supplierRanking: Array<{
    supplierId: string;
    supplierName: string;
    orderCount: number;
    purchaseValueNet: number;
    openOrders: number;
  }>;
  reorderSuggestions: ReorderSuggestionsBody['items'];
  warnings: Array<{ type: string; message: string; severity: string }>;
}

interface ReceiveBody {
  item: StockItemBody;
  movement: {
    _id: string;
    tenantId?: string;
    type: StockMovementType;
    referenceType?: string;
    referenceId?: string;
    quantityChange: number;
    valueNet: number;
  };
}

const tenantAdminCredentials = {
  email: 'admin@frittenwerk-demo.demo',
  password: 'Demo2026!',
};

async function verifyProcurement() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(0, '127.0.0.1');

  const createdIds: {
    supplierIds: string[];
    stockItemIds: string[];
    purchaseOrderIds: string[];
  } = { supplierIds: [], stockItemIds: [], purchaseOrderIds: [] };

  try {
    const address = app.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );
    const supplierModel = app.get<Model<SupplierDocument>>(
      getModelToken(Supplier.name),
    );
    const stockItemModel = app.get<Model<StockItemDocument>>(
      getModelToken(StockItem.name),
    );
    const stockMovementModel = app.get<Model<StockMovementDocument>>(
      getModelToken(StockMovement.name),
    );
    const purchaseOrderModel = app.get<Model<PurchaseOrderDocument>>(
      getModelToken(PurchaseOrder.name),
    );
    const inventoryBatchModel = app.get<Model<InventoryBatchDocument>>(
      getModelToken(InventoryBatch.name),
    );

    const login = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      tenantAdminCredentials,
    );
    assertStatus(login, 201, 'Tenant Admin Login');
    assert(login.body.user.tenantId, 'Login liefert keinen Tenant-Kontext');
    const token = login.body.accessToken;
    const tenantId = login.body.user.tenantId!;

    const location = await locationModel
      .findOne({ tenantId, isActive: { $ne: false } })
      .sort({ name: 1 })
      .exec();
    assert(location, 'Kein aktiver Standort fuer Procurement-Verify gefunden');
    const locationId = location!._id.toString();
    const runId = Date.now().toString();
    const supplierName = `Verify Procurement Supplier ${runId}`;
    const alternateSupplierName = `Verify Procurement Alternate ${runId}`;
    const temporarySupplierName = `Verify Procurement Temp ${runId}`;
    const stockItemName = `Verify Procurement Stock ${runId}`;

    const supplier = await request<SupplierBody>(
      baseUrl,
      'POST',
      '/suppliers',
      token,
      {
        locationId,
        name: supplierName,
        contactName: 'Verify Einkauf',
        email: `procurement-${runId}@gastromania.local`,
        isActive: true,
      },
    );
    assertStatus(supplier, 201, 'Lieferant erstellen');
    createdIds.supplierIds.push(supplier.body._id);

    const alternateSupplier = await request<SupplierBody>(
      baseUrl,
      'POST',
      '/suppliers',
      token,
      {
        locationId,
        name: alternateSupplierName,
        contactName: 'Verify Einkauf 2',
        email: `procurement-alt-${runId}@gastromania.local`,
        isActive: true,
      },
    );
    assertStatus(alternateSupplier, 201, 'Zweiten Lieferanten erstellen');
    createdIds.supplierIds.push(alternateSupplier.body._id);

    const temporarySupplier = await request<SupplierBody>(
      baseUrl,
      'POST',
      '/suppliers',
      token,
      {
        locationId,
        name: temporarySupplierName,
        contactName: 'Verify Einkauf Temp',
        email: `procurement-temp-${runId}@gastromania.local`,
        isActive: true,
      },
    );
    assertStatus(temporarySupplier, 201, 'Temp-Lieferant erstellen');
    createdIds.supplierIds.push(temporarySupplier.body._id);

    const stockItem = await request<StockItemBody>(
      baseUrl,
      'POST',
      '/stock',
      token,
      {
        locationId,
        name: stockItemName,
        category: 'Verify',
        unit: 'Stueck',
        quantity: 10,
        minQuantity: 5,
        criticalQuantity: 2,
        targetQuantity: 20,
        supplierId: supplier.body._id,
        supplierName: supplier.body.name,
        purchasePriceNet: 2,
        lastPurchasePrice: 2,
        averageCost: 2,
        unitCost: 2,
        purchasePriceGross: 2.38,
        isActive: true,
      },
    );
    assertStatus(stockItem, 201, 'Lagerartikel erstellen');
    createdIds.stockItemIds.push(stockItem.body._id);
    assert(
      stockItem.body.tenantId === tenantId,
      'Lagerartikel wurde nicht tenantgebunden erstellt',
    );

    const preferredPrice = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${stockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: supplier.body._id,
        unitPriceNet: 4.25,
        currency: 'EUR',
        unit: 'Stueck',
        isPreferred: true,
        minimumOrderQuantity: 5,
        leadTimeDays: 2,
      },
    );
    assertStatus(preferredPrice, 201, 'Bevorzugten Lieferantenpreis erstellen');
    assert(
      preferredPrice.body.preferredSupplierPrice?.supplierId === supplier.body._id,
      'Bevorzugter Lieferantenpreis wurde nicht gesetzt',
    );

    const cheapestPrice = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${stockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: alternateSupplier.body._id,
        unitPriceNet: 4,
        currency: 'EUR',
        unit: 'Stueck',
        leadTimeDays: 3,
      },
    );
    assertStatus(cheapestPrice, 201, 'Guengstigeren Lieferantenpreis erstellen');
    assert(
      cheapestPrice.body.cheapestSupplierPrice?.supplierId ===
        alternateSupplier.body._id,
      'Guengstigster Lieferantenpreis wurde nicht erkannt',
    );
    assertClose(
      cheapestPrice.body.supplierPriceDifferenceNet ?? 0,
      0.25,
      'Preisunterschied zwischen bevorzugtem und guengstigstem Lieferanten falsch',
    );

    const duplicatePrice = await request<unknown>(
      baseUrl,
      'POST',
      `/stock/items/${stockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: supplier.body._id,
        unitPriceNet: 4.1,
        currency: 'EUR',
        unit: 'Stueck',
      },
    );
    assertStatus(duplicatePrice, 400, 'Doppelten Lieferantenpreis blockieren');

    const foreignLocation = await locationModel
      .findOne({
        tenantId,
        _id: { $ne: locationId },
        isActive: { $ne: false },
      })
      .sort({ name: 1 })
      .exec();
    if (foreignLocation) {
      const foreignSupplier = await request<SupplierBody>(
        baseUrl,
        'POST',
        '/suppliers',
        token,
        {
          locationId: foreignLocation._id.toString(),
          name: `Verify Procurement Foreign ${runId}`,
          contactName: 'Verify Einkauf Fremdstandort',
          email: `procurement-foreign-${runId}@gastromania.local`,
          isActive: true,
        },
      );
      assertStatus(foreignSupplier, 201, 'Fremdstandort-Lieferant erstellen');
      createdIds.supplierIds.push(foreignSupplier.body._id);
      const crossLocationPrice = await request<unknown>(
        baseUrl,
        'POST',
        `/stock/items/${stockItem.body._id}/supplier-prices`,
        token,
        {
          supplierId: foreignSupplier.body._id,
          unitPriceNet: 3.5,
          currency: 'EUR',
          unit: 'Stueck',
        },
      );
      assertStatus(
        crossLocationPrice,
        400,
        'Lieferantenpreis aus Fremdstandort blockieren',
      );
    }

    const tempPrice = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${stockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: temporarySupplier.body._id,
        unitPriceNet: 5,
        currency: 'EUR',
        unit: 'Stueck',
      },
    );
    assertStatus(tempPrice, 201, 'Temp-Lieferantenpreis erstellen');
    const removedTempPrice = await request<StockItemBody>(
      baseUrl,
      'DELETE',
      `/stock/items/${stockItem.body._id}/supplier-prices/${temporarySupplier.body._id}`,
      token,
    );
    assertStatus(removedTempPrice, 200, 'Temp-Lieferantenpreis loeschen');

    const preferredAlternate = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${stockItem.body._id}/supplier-prices/${alternateSupplier.body._id}/prefer`,
      token,
    );
    assertStatus(preferredAlternate, 201, 'Guengstigeren Lieferanten bevorzugen');
    assert(
      preferredAlternate.body.supplierPrices.filter((price) => price.isPreferred)
        .length === 1 &&
        preferredAlternate.body.preferredSupplierPrice?.supplierId ===
          alternateSupplier.body._id,
      'Es darf genau einen bevorzugten Lieferantenpreis geben',
    );

    const overdueStockItem = await request<StockItemBody>(
      baseUrl,
      'POST',
      '/stock',
      token,
      {
        locationId,
        name: `Verify Overdue Procurement Stock ${runId}`,
        category: 'Verify',
        unit: 'Stueck',
        quantity: 12,
        minQuantity: 5,
        criticalQuantity: 2,
        targetQuantity: 20,
        supplierId: alternateSupplier.body._id,
        supplierName: alternateSupplier.body.name,
        purchasePriceNet: 6,
        lastPurchasePrice: 6,
        averageCost: 6,
        unitCost: 6,
        purchasePriceGross: 7.14,
        isActive: true,
      },
    );
    assertStatus(overdueStockItem, 201, 'Overdue-Lagerartikel erstellen');
    createdIds.stockItemIds.push(overdueStockItem.body._id);

    const overdueSupplierPrice = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${overdueStockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: alternateSupplier.body._id,
        unitPriceNet: 6,
        currency: 'EUR',
        unit: 'Stueck',
        isPreferred: true,
      },
    );
    assertStatus(
      overdueSupplierPrice,
      201,
      'Overdue-Lieferantenpreis erstellen',
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const overduePurchaseOrder = await request<PurchaseOrderBody>(
      baseUrl,
      'POST',
      '/stock/purchase-orders',
      token,
      {
        locationId,
        supplierId: alternateSupplier.body._id,
        lines: [{ stockItemId: overdueStockItem.body._id, quantity: 3 }],
        expectedDeliveryDate: yesterday.toISOString(),
        note: 'Verify ueberfaellige Bestellung',
      },
    );
    assertStatus(overduePurchaseOrder, 201, 'Ueberfaellige Purchase Order erstellen');
    createdIds.purchaseOrderIds.push(overduePurchaseOrder.body._id);
    assert(
      Boolean(overduePurchaseOrder.body.expectedDeliveryDate),
      'Expected Delivery Date wurde nicht gespeichert',
    );

    const orderedOverdue = await request<PurchaseOrderBody>(
      baseUrl,
      'PATCH',
      `/stock/purchase-orders/${overduePurchaseOrder.body._id}/status`,
      token,
      { status: PurchaseOrderStatus.Ordered },
    );
    assertStatus(orderedOverdue, 200, 'Ueberfaellige Purchase Order bestellen');
    const overdueLineId = orderedOverdue.body.lines[0]._id;
    const overdueReceipt = await request<ReceiveBody>(
      baseUrl,
      'POST',
      '/stock/receive',
      token,
      {
        stockItemId: overdueStockItem.body._id,
        quantity: 1,
        unitPriceNet: 6,
        purchaseOrderId: orderedOverdue.body._id,
        purchaseOrderLineId: overdueLineId,
        note: 'Verify Wareneingang fuer Procurement Dashboard',
      },
    );
    assertStatus(overdueReceipt, 201, 'Dashboard-Wareneingang buchen');

    const reorderStockItem = await request<StockItemBody>(
      baseUrl,
      'POST',
      '/stock',
      token,
      {
        locationId,
        name: `Verify Reorder Stock ${runId}`,
        category: 'Verify',
        unit: 'Stueck',
        quantity: 8,
        minQuantity: 20,
        criticalQuantity: 2,
        targetQuantity: 60,
        supplierId: alternateSupplier.body._id,
        supplierName: alternateSupplier.body.name,
        purchasePriceNet: 3,
        lastPurchasePrice: 3,
        averageCost: 3,
        unitCost: 3,
        purchasePriceGross: 3.57,
        isActive: true,
      },
    );
    assertStatus(reorderStockItem, 201, 'Reorder-Lagerartikel erstellen');
    createdIds.stockItemIds.push(reorderStockItem.body._id);

    const reorderSupplierPrice = await request<StockItemBody>(
      baseUrl,
      'POST',
      `/stock/items/${reorderStockItem.body._id}/supplier-prices`,
      token,
      {
        supplierId: alternateSupplier.body._id,
        unitPriceNet: 3,
        currency: 'EUR',
        unit: 'Stueck',
        isPreferred: true,
      },
    );
    assertStatus(
      reorderSupplierPrice,
      201,
      'Reorder-Lieferantenpreis erstellen',
    );

    const reorderSuggestions = await request<ReorderSuggestionsBody>(
      baseUrl,
      'GET',
      `/stock/reorder-suggestions?locationId=${locationId}&strategy=preferred`,
      token,
    );
    assertStatus(reorderSuggestions, 200, 'Bestellvorschlaege laden');
    const reorderSuggestion = reorderSuggestions.body.items.find(
      (item) => item.stockItemId === reorderStockItem.body._id,
    );
    assert(reorderSuggestion, 'Reorder-Artikel fehlt in Bestellvorschlaegen');
    assert(
      reorderSuggestion!.suggestedQuantity === 52,
      'Bestellvorschlag berechnet Zielmenge minus Bestand falsch',
    );
    assert(
      reorderSuggestion!.supplierId === alternateSupplier.body._id,
      'Bestellvorschlag waehlt nicht den bevorzugten Lieferantenpreis',
    );
    assertClose(
      reorderSuggestion!.estimatedTotalNet ?? 0,
      156,
      'Bestellvorschlag berechnet erwartete Kosten falsch',
    );

    const procurementDashboard = await request<ProcurementDashboardBody>(
      baseUrl,
      'GET',
      `/stock/procurement-dashboard?locationId=${locationId}&range=month`,
      token,
    );
    assertStatus(procurementDashboard, 200, 'Procurement Dashboard laden');
    assert(
      procurementDashboard.body.summary.openOrders > 0,
      'Procurement Dashboard zeigt keine offenen Bestellungen',
    );
    assert(
      procurementDashboard.body.summary.overdueOrders > 0,
      'Procurement Dashboard zeigt keine ueberfaelligen Bestellungen',
    );
    assert(
      procurementDashboard.body.summary.receiptsToday > 0 &&
        procurementDashboard.body.receipts.some(
          (receipt) => receipt.referenceId === orderedOverdue.body._id,
        ),
      'Procurement Dashboard zeigt Wareneingaenge nicht',
    );
    assert(
      procurementDashboard.body.summary.reorderSuggestions > 0 &&
        procurementDashboard.body.reorderSuggestions.some(
          (item) => item.stockItemId === reorderStockItem.body._id,
        ),
      'Procurement Dashboard integriert Bestellvorschlaege nicht',
    );
    assert(
      procurementDashboard.body.purchaseOrders.some(
        (order) => order._id === orderedOverdue.body._id && order.isOverdue,
      ),
      'Procurement Dashboard markiert ueberfaellige PO nicht',
    );
    assert(
      procurementDashboard.body.supplierRanking.some(
        (supplier) =>
          supplier.supplierId === alternateSupplier.body._id &&
          supplier.orderCount > 0 &&
          supplier.openOrders > 0,
      ),
      'Procurement Dashboard berechnet Lieferantenranking nicht',
    );
    assert(
      procurementDashboard.body.warnings.some(
        (warning) => warning.type === 'overdue_order',
      ),
      'Procurement Dashboard zeigt keine Ueberfaelligkeitswarnung',
    );

    const reorderPurchaseOrders = await request<PurchaseOrderBody[]>(
      baseUrl,
      'POST',
      '/stock/reorder-suggestions/create-purchase-order',
      token,
      {
        locationId,
        items: [
          {
            stockItemId: reorderSuggestion!.stockItemId,
            quantity: reorderSuggestion!.suggestedQuantity,
            unit: reorderSuggestion!.unit,
            supplierId: reorderSuggestion!.supplierId,
            expectedUnitCost: reorderSuggestion!.unitPriceNet,
          },
        ],
      },
    );
    assertStatus(
      reorderPurchaseOrders,
      201,
      'Bestellvorschlag in Purchase Order umwandeln',
    );
    assert(
      reorderPurchaseOrders.body.length === 1,
      'Bestellvorschlag erzeugt nicht genau eine Purchase Order',
    );
    const reorderPurchaseOrder = reorderPurchaseOrders.body[0];
    createdIds.purchaseOrderIds.push(reorderPurchaseOrder._id);
    assert(
      reorderPurchaseOrder.supplierId === alternateSupplier.body._id,
      'Bestellvorschlag erzeugt Purchase Order beim falschen Lieferanten',
    );
    assert(
      reorderPurchaseOrder.lines[0]?.stockItemId === reorderStockItem.body._id &&
        reorderPurchaseOrder.lines[0]?.quantity === 52 &&
        reorderPurchaseOrder.lines[0]?.openQuantity === 52,
      'Bestellvorschlag erzeugt falsche Purchase-Order-Position',
    );

    const coveredSuggestions = await request<ReorderSuggestionsBody>(
      baseUrl,
      'GET',
      `/stock/reorder-suggestions?locationId=${locationId}&strategy=preferred&includeCovered=true`,
      token,
    );
    assertStatus(
      coveredSuggestions,
      200,
      'Gedeckte Bestellvorschlaege laden',
    );
    const coveredSuggestion = coveredSuggestions.body.items.find(
      (item) => item.stockItemId === reorderStockItem.body._id,
    );
    assert(coveredSuggestion, 'Gedeckter Reorder-Artikel fehlt');
    assert(
      coveredSuggestion!.openPurchaseQuantity === 52 &&
        coveredSuggestion!.suggestedQuantity === 0,
      'Offene Purchase Order deckt Bestellvorschlag nicht korrekt ab',
    );
    assert(
      coveredSuggestion!.warnings.includes(
        'Open purchase order already covers shortage',
      ),
      'Gedeckter Bestellvorschlag enthaelt keine Warnung zur offenen Bestellung',
    );

    const purchaseOrder = await request<PurchaseOrderBody>(
      baseUrl,
      'POST',
      '/stock/purchase-orders',
      token,
      {
        locationId,
        supplierId: alternateSupplier.body._id,
        lines: [{ stockItemId: stockItem.body._id, quantity: 10 }],
        note: 'Verify Procurement',
      },
    );
    assertStatus(purchaseOrder, 201, 'Purchase Order erstellen');
    createdIds.purchaseOrderIds.push(purchaseOrder.body._id);
    assert(
      purchaseOrder.body.status === PurchaseOrderStatus.Draft,
      'Neue Purchase Order ist nicht im Entwurf',
    );
    assert(
      purchaseOrder.body.tenantId === tenantId,
      'Purchase Order wurde nicht tenantgebunden erstellt',
    );
    assert(
      purchaseOrder.body.lines[0]?.expectedUnitCost === 4,
      'Expected Unit Cost wurde nicht aus dem Lieferantenpreis uebernommen',
    );
    assert(
      purchaseOrder.body.lines[0]?.receivedQuantity === 0 &&
        purchaseOrder.body.lines[0]?.openQuantity === 10,
      'Neue Purchase Order hat falsche Empfangsmengen',
    );

    const ordered = await request<PurchaseOrderBody>(
      baseUrl,
      'PATCH',
      `/stock/purchase-orders/${purchaseOrder.body._id}/status`,
      token,
      { status: PurchaseOrderStatus.Ordered },
    );
    assertStatus(ordered, 200, 'Purchase Order als bestellt markieren');
    assert(
      ordered.body.status === PurchaseOrderStatus.Ordered,
      'Purchase Order wurde nicht auf Bestellt gesetzt',
    );

    const lineId = ordered.body.lines[0]._id;
    const partialReceipt = await request<ReceiveBody>(
      baseUrl,
      'POST',
      '/stock/receive',
      token,
      {
        stockItemId: stockItem.body._id,
        quantity: 4,
        unitPriceNet: 4,
        purchaseOrderId: ordered.body._id,
        purchaseOrderLineId: lineId,
        note: 'Verify Teilwareneingang',
      },
    );
    assertStatus(partialReceipt, 201, 'Teilwareneingang buchen');
    assert(
      partialReceipt.body.item.quantity === 14,
      'Teilwareneingang hat Bestand nicht korrekt erhoeht',
    );
    assert(
      partialReceipt.body.item.lastPurchasePrice === 4,
      'Teilwareneingang aktualisiert den letzten Einkaufspreis nicht',
    );
    assertClose(
      partialReceipt.body.item.averagePurchasePrice,
      2.57,
      'Teilwareneingang aktualisiert den Durchschnittspreis nicht',
    );
    assertClose(
      partialReceipt.body.item.stockValueNet,
      35.98,
      'Teilwareneingang berechnet den Lagerwert nicht aus Durchschnittskosten',
    );
    assertClose(
      partialReceipt.body.movement.valueNet,
      16,
      'Teilwareneingang schreibt falschen Movement-Wert',
    );
    assert(
      partialReceipt.body.movement.type === StockMovementType.Receipt,
      'Teilwareneingang hat keine Wareneingangsbewegung erzeugt',
    );
    assert(
      partialReceipt.body.movement.referenceType === 'purchase_order' &&
        partialReceipt.body.movement.referenceId === ordered.body._id,
      'StockMovement referenziert die Purchase Order nicht',
    );

    const afterPartial = await request<PurchaseOrderBody[]>(
      baseUrl,
      'GET',
      `/stock/purchase-orders?locationId=${locationId}`,
      token,
    );
    assertStatus(afterPartial, 200, 'Purchase Orders nach Teilwareneingang laden');
    const partialOrder = findOrder(afterPartial.body, ordered.body._id);
    assert(
      partialOrder.status === PurchaseOrderStatus.PartiallyReceived,
      'Teilwareneingang setzt Status nicht auf Teilweise geliefert',
    );
    assert(
      partialOrder.lines[0].receivedQuantity === 4 &&
        partialOrder.lines[0].openQuantity === 6,
      'Teilwareneingang aktualisiert Empfangsmengen nicht korrekt',
    );

    const finalReceipt = await request<ReceiveBody>(
      baseUrl,
      'POST',
      '/stock/receive',
      token,
      {
        stockItemId: stockItem.body._id,
        quantity: 6,
        unitPriceNet: 4,
        purchaseOrderId: ordered.body._id,
        purchaseOrderLineId: lineId,
        note: 'Verify Vollwareneingang',
      },
    );
    assertStatus(finalReceipt, 201, 'Vollwareneingang buchen');
    assert(
      finalReceipt.body.item.quantity === 20,
      'Vollwareneingang hat Bestand nicht korrekt erhoeht',
    );
    assert(
      finalReceipt.body.item.lastPurchasePrice === 4,
      'Vollwareneingang behaelt den letzten Einkaufspreis nicht',
    );
    const finalSupplierPrice = finalReceipt.body.item.supplierPrices.find(
      (price) => price.supplierId === alternateSupplier.body._id,
    );
    assert(
      finalSupplierPrice?.lastPurchasePriceNet === 4 &&
        Boolean(finalSupplierPrice.lastPurchasedAt),
      'Wareneingang aktualisiert letzten Lieferanten-EK nicht',
    );
    assert(
      finalSupplierPrice.unitPriceNet === 4,
      'Wareneingang darf den Stammpreis des Lieferanten nicht ueberschreiben',
    );
    assertClose(
      finalReceipt.body.item.averagePurchasePrice,
      3,
      'Vollwareneingang berechnet den finalen Durchschnittspreis nicht',
    );
    assertClose(
      finalReceipt.body.item.stockValueNet,
      60,
      'Vollwareneingang berechnet den finalen Lagerwert nicht',
    );

    const afterReceived = await request<PurchaseOrderBody[]>(
      baseUrl,
      'GET',
      `/stock/purchase-orders?locationId=${locationId}`,
      token,
    );
    assertStatus(afterReceived, 200, 'Purchase Orders nach Vollwareneingang laden');
    const receivedOrder = findOrder(afterReceived.body, ordered.body._id);
    assert(
      receivedOrder.status === PurchaseOrderStatus.Received,
      'Vollwareneingang setzt Status nicht auf Geliefert',
    );
    assert(
      receivedOrder.lines[0].receivedQuantity === 10 &&
        receivedOrder.lines[0].openQuantity === 0,
      'Vollwareneingang aktualisiert Empfangsmengen nicht korrekt',
    );

    const movements = await stockMovementModel
      .find({
        tenantId,
        locationId,
        stockItemId: stockItem.body._id,
        type: StockMovementType.Receipt,
        referenceType: 'purchase_order',
        referenceId: ordered.body._id,
      })
      .lean()
      .exec();
    assert(
      movements.length === 2,
      `Erwartet 2 Wareneingangsbewegungen, gefunden ${movements.length}`,
    );
    assert(
      movements.reduce((sum, movement) => sum + Number(movement.quantityChange), 0) === 10,
      'StockMovement-Mengen entsprechen nicht der gelieferten Menge',
    );
    const batches = await inventoryBatchModel
      .find({ tenantId, locationId, stockItemId: stockItem.body._id })
      .lean()
      .exec();
    assert(
      batches.length === 2,
      `Erwartet 2 Wareneingangschargen, gefunden ${batches.length}`,
    );
    assertClose(
      batches.reduce(
        (sum, batch) =>
          sum + Number(batch.initialQuantity) * Number(batch.unitPriceNet),
        0,
      ),
      40,
      'InventoryBatch-Werte entsprechen nicht Menge mal Einkaufspreis',
    );
    assertClose(
      movements.reduce((sum, movement) => sum + Number(movement.valueNet), 0),
      40,
      'StockMovement-Werte entsprechen nicht Menge mal Wareneingangspreis',
    );

    const persisted = await purchaseOrderModel
      .findById(ordered.body._id)
      .lean()
      .exec();
    assert(persisted, 'Purchase Order wurde nicht persistiert');
    assert(
      persisted!.status === PurchaseOrderStatus.Received,
      'Persistierte Purchase Order ist nicht geliefert',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId,
          locationId,
          purchaseOrderId: ordered.body._id,
          reorderPurchaseOrderId: reorderPurchaseOrder._id,
          orderNumber: ordered.body.orderNumber,
          finalStatus: receivedOrder.status,
          finalQuantity: finalReceipt.body.item.quantity,
          lastPurchasePrice: finalReceipt.body.item.lastPurchasePrice,
          averagePurchasePrice: finalReceipt.body.item.averagePurchasePrice,
          stockValueNet: finalReceipt.body.item.stockValueNet,
          preferredSupplierId: finalReceipt.body.item.preferredSupplierPrice?.supplierId,
          cheapestSupplierId: finalReceipt.body.item.cheapestSupplierPrice?.supplierId,
          supplierPriceCount: finalReceipt.body.item.supplierPrices.length,
          receiptMovements: movements.length,
        },
        null,
        2,
      ),
    );
  } finally {
    const stockMovementModel = app.get<Model<StockMovementDocument>>(
      getModelToken(StockMovement.name),
    );
    const purchaseOrderModel = app.get<Model<PurchaseOrderDocument>>(
      getModelToken(PurchaseOrder.name),
    );
    const stockItemModel = app.get<Model<StockItemDocument>>(
      getModelToken(StockItem.name),
    );
    const inventoryBatchModel = app.get<Model<InventoryBatchDocument>>(
      getModelToken(InventoryBatch.name),
    );
    const supplierModel = app.get<Model<SupplierDocument>>(
      getModelToken(Supplier.name),
    );
    if (createdIds.purchaseOrderIds.length) {
      await stockMovementModel
        .deleteMany({ referenceId: { $in: createdIds.purchaseOrderIds } })
        .exec();
      await purchaseOrderModel
        .deleteMany({ _id: { $in: createdIds.purchaseOrderIds } })
        .exec();
    }
    if (createdIds.stockItemIds.length) {
      await inventoryBatchModel
        .deleteMany({ stockItemId: { $in: createdIds.stockItemIds } })
        .exec();
      await stockItemModel
        .deleteMany({ _id: { $in: createdIds.stockItemIds } })
        .exec();
    }
    if (createdIds.supplierIds.length) {
      await supplierModel
        .deleteMany({ _id: { $in: createdIds.supplierIds } })
        .exec();
    }
    await app.close();
  }
}

function findOrder(orders: PurchaseOrderBody[], id: string): PurchaseOrderBody {
  const order = orders.find((entry) => entry._id === id);
  assert(order, `Purchase Order ${id} fehlt`);
  return order!;
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: response.status, body: parsed };
}

function assertStatus<T>(
  result: ApiResult<T>,
  expectedStatus: number,
  label: string,
): void {
  if (result.status !== expectedStatus) {
    throw new Error(
      `${label}: erwartet HTTP ${expectedStatus}, erhalten ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertClose(value: number, expected: number, message: string): void {
  if (Math.abs(value - expected) > 0.01) {
    throw new Error(`${message}: erwartet ${expected}, erhalten ${value}`);
  }
}

verifyProcurement().catch((error) => {
  console.error(error);
  process.exit(1);
});
