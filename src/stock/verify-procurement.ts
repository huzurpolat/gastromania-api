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
    supplierId?: string;
    stockItemId?: string;
    purchaseOrderId?: string;
  } = {};

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
    createdIds.supplierId = supplier.body._id;

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
    createdIds.stockItemId = stockItem.body._id;
    assert(
      stockItem.body.tenantId === tenantId,
      'Lagerartikel wurde nicht tenantgebunden erstellt',
    );

    const purchaseOrder = await request<PurchaseOrderBody>(
      baseUrl,
      'POST',
      '/stock/purchase-orders',
      token,
      {
        locationId,
        supplierId: supplier.body._id,
        lines: [
          { stockItemId: stockItem.body._id, quantity: 10, expectedUnitCost: 4 },
        ],
        note: 'Verify Procurement',
      },
    );
    assertStatus(purchaseOrder, 201, 'Purchase Order erstellen');
    createdIds.purchaseOrderId = purchaseOrder.body._id;
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
      'Expected Unit Cost wurde nicht aus der Purchase Order uebernommen',
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
          orderNumber: ordered.body.orderNumber,
          finalStatus: receivedOrder.status,
          finalQuantity: finalReceipt.body.item.quantity,
          lastPurchasePrice: finalReceipt.body.item.lastPurchasePrice,
          averagePurchasePrice: finalReceipt.body.item.averagePurchasePrice,
          stockValueNet: finalReceipt.body.item.stockValueNet,
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
    if (createdIds.purchaseOrderId) {
      await stockMovementModel
        .deleteMany({ referenceId: createdIds.purchaseOrderId })
        .exec();
      await purchaseOrderModel
        .deleteOne({ _id: createdIds.purchaseOrderId })
        .exec();
    }
    if (createdIds.stockItemId) {
      await inventoryBatchModel
        .deleteMany({ stockItemId: createdIds.stockItemId })
        .exec();
      await stockItemModel.deleteOne({ _id: createdIds.stockItemId }).exec();
    }
    if (createdIds.supplierId) {
      await supplierModel.deleteOne({ _id: createdIds.supplierId }).exec();
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
