export interface StockValuationSource {
  quantity?: number;
  purchasePriceNet?: number;
  lastPurchasePrice?: number;
  averageCost?: number;
  unitCost?: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function resolveValuationUnitCost(
  item: StockValuationSource,
): number {
  const candidates = [
    item.averageCost,
    item.unitCost,
    item.lastPurchasePrice,
    item.purchasePriceNet,
  ];
  const price = candidates.find(
    (candidate) => typeof candidate === 'number' && candidate > 0,
  );

  return roundMoney(price ?? 0);
}

export function calculateWeightedAveragePurchasePrice(params: {
  quantityBefore: number;
  previousAverageCost: number;
  receivedQuantity: number;
  receivedUnitCost: number;
}): number {
  const quantityBefore = Math.max(params.quantityBefore, 0);
  const receivedQuantity = Math.max(params.receivedQuantity, 0);
  const quantityAfter = quantityBefore + receivedQuantity;

  if (quantityAfter <= 0 || params.receivedUnitCost <= 0) {
    return roundMoney(params.previousAverageCost);
  }

  const previousValue = quantityBefore * Math.max(params.previousAverageCost, 0);
  const receivedValue = receivedQuantity * params.receivedUnitCost;

  return roundMoney((previousValue + receivedValue) / quantityAfter);
}

export function calculateStockValueNet(
  item: StockValuationSource,
): number {
  return roundMoney(Math.max(item.quantity ?? 0, 0) * resolveValuationUnitCost(item));
}

export function createValuationWarnings(
  item: StockValuationSource,
): string[] {
  if (resolveValuationUnitCost(item) > 0) {
    return [];
  }

  return ['Einkaufspreis fehlt'];
}
