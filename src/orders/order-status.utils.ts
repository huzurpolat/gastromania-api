import { TableStatus } from '../tables/schemas/table.schema';
import {
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
} from './schemas/order.schema';

type OrderStatusInput = {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  statusTimestamps?: Partial<Record<OrderStatus, Date>>;
  createdAt?: Date;
};

type OrderItemStatusInput = {
  status?: OrderItemStatus;
};

export function deriveOrderStatusFromItems(
  items: OrderItemStatusInput[],
  fallbackStatus: OrderStatus,
): OrderStatus {
  const statuses = items.map((item) => item.status ?? OrderItemStatus.Open);

  if (!statuses.length) {
    return fallbackStatus;
  }

  const activeStatuses = statuses.filter(
    (status) => status !== OrderItemStatus.Cancelled,
  );

  if (!activeStatuses.length) {
    return OrderStatus.Cancelled;
  }

  if (activeStatuses.every((status) => status === OrderItemStatus.Served)) {
    return OrderStatus.Served;
  }

  if (
    activeStatuses.every((status) =>
      [OrderItemStatus.Ready, OrderItemStatus.Served].includes(status),
    )
  ) {
    return OrderStatus.Ready;
  }

  if (shouldMarkOrderInProgress(activeStatuses)) {
    return OrderStatus.Preparing;
  }

  return OrderStatus.New;
}

export function aggregateOrderStatus(order: {
  items: OrderItemStatusInput[];
  status: OrderStatus;
}): OrderStatus {
  return deriveOrderStatusFromItems(order.items, order.status);
}

export function shouldMarkOrderInProgress(
  itemsOrStatuses: Array<OrderItemStatusInput | OrderItemStatus>,
): boolean {
  return itemsOrStatuses
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : (entry.status ?? OrderItemStatus.Open),
    )
    .some((status) =>
      [
        OrderItemStatus.Started,
        OrderItemStatus.Preparing,
        OrderItemStatus.Ready,
        OrderItemStatus.Served,
      ].includes(status),
    );
}

export function mapOrderStatusToTableStatus(
  status: OrderStatus,
  paymentStatus?: PaymentStatus,
): TableStatus {
  if (paymentStatus === PaymentStatus.Paid) {
    return TableStatus.Paid;
  }

  switch (status) {
    case OrderStatus.Draft:
    case OrderStatus.New:
      return TableStatus.Ordering;
    case OrderStatus.Accepted:
      return TableStatus.OrderSent;
    case OrderStatus.Preparing:
      return TableStatus.InPreparation;
    case OrderStatus.Ready:
      return TableStatus.ReadyToServe;
    case OrderStatus.Served:
      return TableStatus.Served;
    case OrderStatus.Closed:
      return TableStatus.Paid;
    case OrderStatus.Cancelled:
      return TableStatus.Free;
  }
}

export function getTableStatusForOrders(
  activeOrders: OrderStatusInput[],
  fallbackOrder: Pick<OrderStatusInput, 'status' | 'paymentStatus'>,
  options: {
    removed?: boolean;
    emptyTableStatusMode?: 'orders' | 'kds';
  } = {},
): TableStatus {
  if (options.removed || !activeOrders.length) {
    if (options.removed) {
      return TableStatus.Free;
    }

    if (options.emptyTableStatusMode === 'kds') {
      return fallbackOrder.status === OrderStatus.Cancelled
        ? TableStatus.Free
        : TableStatus.Paid;
    }

    return fallbackOrder.paymentStatus === PaymentStatus.Paid
      ? TableStatus.Paid
      : TableStatus.Free;
  }

  if (activeOrders.some((order) => order.paymentStatus === PaymentStatus.Paid)) {
    return TableStatus.Paid;
  }
  if (activeOrders.some((order) => order.status === OrderStatus.Served)) {
    return TableStatus.Served;
  }
  if (activeOrders.some((order) => order.status === OrderStatus.Ready)) {
    return TableStatus.ReadyToServe;
  }
  if (activeOrders.some((order) => order.status === OrderStatus.Preparing)) {
    return TableStatus.InPreparation;
  }
  if (activeOrders.some((order) => order.status === OrderStatus.Accepted)) {
    return TableStatus.OrderSent;
  }
  if (
    activeOrders.some((order) =>
      [OrderStatus.Draft, OrderStatus.New].includes(order.status),
    )
  ) {
    return TableStatus.Ordering;
  }

  return mapOrderStatusToTableStatus(
    fallbackOrder.status,
    fallbackOrder.paymentStatus,
  );
}

export function getTableWaitingSince(
  activeOrders: OrderStatusInput[],
): Date | undefined {
  const timestamps = activeOrders
    .map(
      (order) =>
        order.statusTimestamps?.[OrderStatus.Accepted] ??
        order.statusTimestamps?.[OrderStatus.Preparing] ??
        order.statusTimestamps?.[OrderStatus.New] ??
        order.createdAt,
    )
    .filter((value): value is Date => Boolean(value))
    .sort((first, second) => first.getTime() - second.getTime());

  return timestamps[0];
}

export function getTableEventForOrderStatus(
  status: OrderStatus,
  paymentStatus?: PaymentStatus,
): string | null {
  if (paymentStatus === PaymentStatus.Paid || status === OrderStatus.Closed) {
    return 'table.paid';
  }

  if (status === OrderStatus.Accepted) {
    return 'table.order.sent';
  }

  if (status === OrderStatus.Ready) {
    return 'table.order.ready';
  }

  if ([OrderStatus.Draft, OrderStatus.New].includes(status)) {
    return 'table.order.created';
  }

  return null;
}
