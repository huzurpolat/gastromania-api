import {
  calculateStockValueNet,
  calculateWeightedAveragePurchasePrice,
  createValuationWarnings,
  resolveValuationUnitCost,
} from './stock-valuation';

describe('stock valuation', () => {
  it('uses average cost as leading valuation price', () => {
    expect(
      resolveValuationUnitCost({
        purchasePriceNet: 1.5,
        lastPurchasePrice: 2,
        unitCost: 2.5,
        averageCost: 3,
      }),
    ).toBe(3);
  });

  it('calculates weighted average purchase price for receipts', () => {
    expect(
      calculateWeightedAveragePurchasePrice({
        quantityBefore: 10,
        previousAverageCost: 2,
        receivedQuantity: 4,
        receivedUnitCost: 4,
      }),
    ).toBe(2.57);

    expect(
      calculateWeightedAveragePurchasePrice({
        quantityBefore: 14,
        previousAverageCost: 2.57,
        receivedQuantity: 6,
        receivedUnitCost: 4,
      }),
    ).toBe(3);
  });

  it('calculates stock value from quantity and average cost', () => {
    expect(
      calculateStockValueNet({
        quantity: 20,
        averageCost: 3,
        purchasePriceNet: 9,
      }),
    ).toBe(60);
  });

  it('returns warnings instead of failing when prices are missing', () => {
    expect(createValuationWarnings({ quantity: 12 })).toEqual([
      'Einkaufspreis fehlt',
    ]);
  });
});
