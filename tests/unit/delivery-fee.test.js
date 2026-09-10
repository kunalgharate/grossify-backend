const { computeDeliveryFee } = require('../../src/modules/delivery/delivery-fee');

describe('computeDeliveryFee', () => {
  describe('GROSSIFY delivery — standard split', () => {
    it('₹20 + ₹20 pool → Grossify 5% = ₹2, partner ₹38 (the confirmed example)', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 300 });
      expect(r.storeShare).toBe(20);
      expect(r.customerShare).toBe(20);
      expect(r.pool).toBe(40);
      expect(r.platformCommission).toBe(2);
      expect(r.partnerPayout).toBe(38);
      expect(r.isFree).toBe(false);
    });

    it('commission + partner always sum to the pool', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 300 });
      expect(r.platformCommission + r.partnerPayout).toBe(r.pool);
    });

    it('store + customer shares sum to the pool when not free', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 50 });
      expect(r.storeShare + r.customerShare).toBe(r.pool);
    });
  });

  describe('SELF delivery — Grossify charges nothing', () => {
    it('returns all zeros', () => {
      const r = computeDeliveryFee({ mode: 'SELF', orderValue: 500 });
      expect(r).toMatchObject({
        mode: 'SELF', isFree: false,
        storeShare: 0, customerShare: 0, pool: 0,
        platformCommission: 0, partnerPayout: 0,
      });
    });
  });

  describe('free-above-threshold — store bears the whole pool', () => {
    it('order ≥ threshold → customer ₹0, store ₹40, partner still ₹38, Grossify still ₹2', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 250, freeDeliveryAbove: 200 });
      expect(r.isFree).toBe(true);
      expect(r.customerShare).toBe(0);
      expect(r.storeShare).toBe(40);
      expect(r.pool).toBe(40);
      expect(r.platformCommission).toBe(2);
      expect(r.partnerPayout).toBe(38);
    });

    it('order below threshold → normal split (customer pays their side)', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 150, freeDeliveryAbove: 200 });
      expect(r.isFree).toBe(false);
      expect(r.customerShare).toBe(20);
      expect(r.storeShare).toBe(20);
    });

    it('exactly at threshold qualifies (>=)', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 200, freeDeliveryAbove: 200 });
      expect(r.isFree).toBe(true);
      expect(r.customerShare).toBe(0);
    });
  });

  describe('distance raises a side above the ₹20 minimum', () => {
    it('honours per-side fees above the minimum and still splits pool', () => {
      // e.g. distance pushes each side to ₹30 → pool ₹60, commission ₹3, partner ₹57
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 100, storeSideFee: 30, customerSideFee: 30 });
      expect(r.pool).toBe(60);
      expect(r.storeShare).toBe(30);
      expect(r.customerShare).toBe(30);
      expect(r.platformCommission).toBe(3);
      expect(r.partnerPayout).toBe(57);
    });

    it('a side below the minimum is clamped up to ₹20', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 100, storeSideFee: 10, customerSideFee: 5 });
      expect(r.storeShare).toBe(20);
      expect(r.customerShare).toBe(20);
      expect(r.pool).toBe(40);
    });
  });

  describe('configurable commission', () => {
    it('commissionPct 10 on a ₹40 pool → ₹4 to Grossify, ₹36 to partner', () => {
      const r = computeDeliveryFee({ mode: 'GROSSIFY', orderValue: 100, commissionPct: 10 });
      expect(r.platformCommission).toBe(4);
      expect(r.partnerPayout).toBe(36);
    });
  });

  describe('guards', () => {
    it('throws on an unknown mode', () => {
      expect(() => computeDeliveryFee({ mode: 'FOO' })).toThrow(/SELF or GROSSIFY/);
    });
  });
});
