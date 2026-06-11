export interface SupplierPriceLike {
  supplierId: string;
  unit: string;
  unitPriceNet: number;
  isPreferred?: boolean;
}

export function normalizeSupplierPriceUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

export function findDuplicateSupplierPrice(
  prices: SupplierPriceLike[],
  supplierId: string,
  unit: string,
  ignoreIndex = -1,
): SupplierPriceLike | undefined {
  const normalizedUnit = normalizeSupplierPriceUnit(unit);
  return prices.find(
    (price, index) =>
      index !== ignoreIndex &&
      price.supplierId === supplierId &&
      normalizeSupplierPriceUnit(price.unit) === normalizedUnit,
  );
}

export function getPreferredSupplierPrice<T extends SupplierPriceLike>(
  prices: T[],
): T | undefined {
  return prices.find((price) => price.isPreferred);
}

export function getCheapestSupplierPrice<T extends SupplierPriceLike>(
  prices: T[],
): T | undefined {
  return prices
    .filter((price) => Number.isFinite(price.unitPriceNet))
    .sort((a, b) => a.unitPriceNet - b.unitPriceNet)[0];
}

export function calculateSupplierPriceDifference(
  prices: SupplierPriceLike[],
): number | undefined {
  const preferred = getPreferredSupplierPrice(prices);
  const cheapest = getCheapestSupplierPrice(prices);
  if (!preferred || !cheapest) {
    return undefined;
  }
  return Math.round((preferred.unitPriceNet - cheapest.unitPriceNet) * 100) / 100;
}
