/* eslint-disable @typescript-eslint/no-floating-promises */
import { StockController } from './stock.controller';

describe('StockController', () => {
  const actor = {
    sub: 'user-1',
    email: 'lager@gastromania.local',
    roles: ['Lager'],
  } as never;
  const stockService = {
    dashboard: jest.fn(),
    procurementDashboard: jest.fn(),
    createLocation: jest.fn(),
    createCategory: jest.fn(),
    startInventory: jest.fn(),
    completeInventory: jest.fn(),
    adjust: jest.fn(),
  };
  let controller: StockController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StockController(stockService as never);
  });

  it('routes dashboard requests with location scope', () => {
    controller.dashboard(actor, 'loc-1');

    expect(stockService.dashboard).toHaveBeenCalledWith(actor, 'loc-1');
  });

  it('routes procurement dashboard requests with filters', () => {
    controller.procurementDashboard(
      actor,
      'loc-1',
      'supplier-1',
      'Bestellt' as never,
      'week',
      '2026-06-01',
      '2026-06-11',
    );

    expect(stockService.procurementDashboard).toHaveBeenCalledWith(actor, {
      locationId: 'loc-1',
      supplierId: 'supplier-1',
      status: 'Bestellt',
      range: 'week',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-11',
    });
  });

  it('creates inventory locations through the stock service', () => {
    const payload = {
      locationId: '6627d9a2c6f2d8f3e2b1a001',
      name: 'Kühlhaus',
      description: 'Temperaturgeführt',
      isActive: true,
      isArchived: false,
    };

    controller.createLocation(payload, actor);

    expect(stockService.createLocation).toHaveBeenCalledWith(payload, actor);
  });

  it('starts and completes inventory sessions', () => {
    controller.startInventory(
      { locationId: '6627d9a2c6f2d8f3e2b1a001', note: 'Monatsinventur' },
      actor,
    );
    controller.completeInventory(
      'inventory-1',
      {
        counts: [
          { stockItemId: '6627d9a2c6f2d8f3e2b1a002', countedQuantity: 12 },
        ],
      },
      actor,
    );

    expect(stockService.startInventory).toHaveBeenCalledTimes(1);
    expect(stockService.completeInventory).toHaveBeenCalledWith(
      'inventory-1',
      {
        counts: [
          { stockItemId: '6627d9a2c6f2d8f3e2b1a002', countedQuantity: 12 },
        ],
      },
      actor,
    );
  });

  it('books stock movements with the selected movement type', () => {
    controller.adjust(
      'stock-1',
      {
        type: 'Wareneingang' as never,
        quantityChange: 10,
        note: 'Lieferung',
        unitPriceNet: 2.5,
      },
      actor,
    );

    expect(stockService.adjust).toHaveBeenCalledWith(
      'stock-1',
      {
        type: 'Wareneingang',
        quantityChange: 10,
        note: 'Lieferung',
        unitPriceNet: 2.5,
      },
      actor,
    );
  });
});
