import {
  calculateSupplierPriceDifference,
  findDuplicateSupplierPrice,
  getCheapestSupplierPrice,
  getPreferredSupplierPrice,
} from './supplier-price-utils';

describe('supplier price utilities', () => {
  const prices = [
    {
      supplierId: 'supplier-a',
      unit: 'Kilogramm',
      unitPriceNet: 4.25,
      isPreferred: true,
    },
    {
      supplierId: 'supplier-b',
      unit: 'Kilogramm',
      unitPriceNet: 4,
      isPreferred: false,
    },
  ];

  it('finds preferred and cheapest supplier prices', () => {
    expect(getPreferredSupplierPrice(prices)?.supplierId).toBe('supplier-a');
    expect(getCheapestSupplierPrice(prices)?.supplierId).toBe('supplier-b');
    expect(calculateSupplierPriceDifference(prices)).toBe(0.25);
  });

  it('detects duplicate supplier and unit combinations case-insensitively', () => {
    expect(findDuplicateSupplierPrice(prices, 'supplier-a', 'kilogramm')).toBeDefined();
    expect(findDuplicateSupplierPrice(prices, 'supplier-a', 'Liter')).toBeUndefined();
    expect(findDuplicateSupplierPrice(prices, 'supplier-a', 'Kilogramm', 0)).toBeUndefined();
  });
});
