const razorpay = require('../../src/modules/payments/razorpay.service');

describe('razorpay.computeRouteTransfers (store-sale split)', () => {
  it('routes the store goods amount (in paise) to the store linked account', () => {
    const t = razorpay.computeRouteTransfers({
      storeAccountId: 'acc_123', goodsAmount: 700, orderNumber: 'GRS-1', storeId: 's1',
    });
    expect(t).toHaveLength(1);
    expect(t[0].account).toBe('acc_123');
    expect(t[0].amount).toBe(70000); // ₹700 → paise
    expect(t[0].currency).toBe('INR');
    expect(t[0].on_hold).toBe(false);
    expect(t[0].notes).toMatchObject({ orderNumber: 'GRS-1', storeId: 's1' });
  });

  it('rounds rupees to whole paise', () => {
    const t = razorpay.computeRouteTransfers({ storeAccountId: 'acc_1', goodsAmount: 199.99 });
    expect(t[0].amount).toBe(19999);
  });

  it('returns null when the store has no linked account (no split)', () => {
    expect(razorpay.computeRouteTransfers({ storeAccountId: null, goodsAmount: 500 })).toBeNull();
  });

  it('returns null when goods amount is zero or negative', () => {
    expect(razorpay.computeRouteTransfers({ storeAccountId: 'acc_1', goodsAmount: 0 })).toBeNull();
    expect(razorpay.computeRouteTransfers({ storeAccountId: 'acc_1', goodsAmount: -10 })).toBeNull();
  });
});
