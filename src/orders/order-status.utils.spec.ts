import { TableStatus } from '../tables/schemas/table.schema';
import {
  aggregateOrderStatus,
  getTableEventForOrderStatus,
  getTableStatusForOrders,
  getTableWaitingSince,
  mapOrderStatusToTableStatus,
} from './order-status.utils';
import {
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
} from './schemas/order.schema';

describe('order-status utils', () => {
  it('keeps orders open when all active items are open', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.Accepted,
        items: [
          { status: OrderItemStatus.Open },
          { status: OrderItemStatus.Open },
        ],
      }),
    ).toBe(OrderStatus.New);
  });

  it('marks the order as preparing when one item is started', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.New,
        items: [
          { status: OrderItemStatus.Started },
          { status: OrderItemStatus.Open },
        ],
      }),
    ).toBe(OrderStatus.Preparing);
  });

  it('marks the order as ready when all active items are ready or served', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.Preparing,
        items: [
          { status: OrderItemStatus.Ready },
          { status: OrderItemStatus.Served },
          { status: OrderItemStatus.Cancelled },
        ],
      }),
    ).toBe(OrderStatus.Ready);
  });

  it('marks the order as served when all active items are served', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.Ready,
        items: [
          { status: OrderItemStatus.Served },
          { status: OrderItemStatus.Served },
        ],
      }),
    ).toBe(OrderStatus.Served);
  });

  it('marks the order as cancelled when all items are cancelled', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.Preparing,
        items: [
          { status: OrderItemStatus.Cancelled },
          { status: OrderItemStatus.Cancelled },
        ],
      }),
    ).toBe(OrderStatus.Cancelled);
  });

  it('keeps mixed ready and open items in preparing', () => {
    expect(
      aggregateOrderStatus({
        status: OrderStatus.Preparing,
        items: [
          { status: OrderItemStatus.Ready },
          { status: OrderItemStatus.Open },
        ],
      }),
    ).toBe(OrderStatus.Preparing);
  });

  it('maps order status to table status centrally', () => {
    expect(mapOrderStatusToTableStatus(OrderStatus.Preparing)).toBe(
      TableStatus.InPreparation,
    );
    expect(
      mapOrderStatusToTableStatus(OrderStatus.New, PaymentStatus.Paid),
    ).toBe(TableStatus.Paid);
  });

  it('derives table status from active orders and preserves empty-mode behavior', () => {
    expect(
      getTableStatusForOrders(
        [{ status: OrderStatus.Ready }],
        { status: OrderStatus.New },
      ),
    ).toBe(TableStatus.ReadyToServe);
    expect(
      getTableStatusForOrders([], { status: OrderStatus.New }),
    ).toBe(TableStatus.Free);
    expect(
      getTableStatusForOrders(
        [],
        { status: OrderStatus.New },
        { emptyTableStatusMode: 'kds' },
      ),
    ).toBe(TableStatus.Paid);
  });

  it('uses the earliest operational timestamp as table waiting time', () => {
    const first = new Date('2026-01-01T10:00:00Z');
    const second = new Date('2026-01-01T11:00:00Z');

    expect(
      getTableWaitingSince([
        {
          status: OrderStatus.Preparing,
          statusTimestamps: { [OrderStatus.New]: second },
        },
        {
          status: OrderStatus.Accepted,
          statusTimestamps: { [OrderStatus.Accepted]: first },
        },
      ]),
    ).toBe(first);
  });

  it('maps order status changes to table realtime events', () => {
    expect(getTableEventForOrderStatus(OrderStatus.Accepted)).toBe(
      'table.order.sent',
    );
    expect(getTableEventForOrderStatus(OrderStatus.Ready)).toBe(
      'table.order.ready',
    );
    expect(getTableEventForOrderStatus(OrderStatus.Closed)).toBe('table.paid');
  });
});
