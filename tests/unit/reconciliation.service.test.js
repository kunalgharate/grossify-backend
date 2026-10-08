const { reconcileFrom } = require('../../src/modules/settlements/reconciliation.service');

describe('reconciliation.reconcileFrom', () => {
  it('MATCHED when settled equals captured minus commission', () => {
    const payments = [{ amount: 1000, status: 'CAPTURED' }];
    const settlements = [{ amount: 900, status: 'settled' }];
    const r = reconcileFrom(payments, settlements, 0.1);
    expect(r.capturedAmount).toBe(1000);
    expect(r.commission).toBe(100);
    expect(r.expectedSettlement).toBe(900);
    expect(r.actualSettled).toBe(900);
    expect(r.variance).toBe(0);
    expect(r.status).toBe('MATCHED');
  });

  it('subtracts refunds from captured', () => {
    const payments = [{ amount: 1000, status: 'CAPTURED', refundAmount: 200 }];
    const settlements = [];
    const r = reconcileFrom(payments, settlements, 0);
    expect(r.capturedAmount).toBe(800);
  });

  it('UNDER_SETTLED when actual < expected', () => {
    const r = reconcileFrom([{ amount: 1000, status: 'CAPTURED' }], [{ amount: 500, status: 'settled' }], 0);
    expect(r.status).toBe('UNDER_SETTLED');
    expect(r.variance).toBe(500);
    expect(r.reconciled).toBe(false);
  });

  it('OVER_SETTLED when actual > expected', () => {
    const r = reconcileFrom([{ amount: 500, status: 'CAPTURED' }], [{ amount: 900, status: 'settled' }], 0);
    expect(r.status).toBe('OVER_SETTLED');
    expect(r.variance).toBe(-400);
  });

  it('ignores non-captured payments and non-settled settlements', () => {
    const payments = [
      { amount: 1000, status: 'CAPTURED' },
      { amount: 500, status: 'FAILED' },
    ];
    const settlements = [
      { amount: 1000, status: 'settled' },
      { amount: 999, status: 'pending' },
    ];
    const r = reconcileFrom(payments, settlements, 0);
    expect(r.capturedAmount).toBe(1000);
    expect(r.actualSettled).toBe(1000);
    expect(r.status).toBe('MATCHED');
  });

  it('uses integer paise to avoid float drift', () => {
    const r = reconcileFrom([{ amount: 0.1, status: 'CAPTURED' }, { amount: 0.2, status: 'CAPTURED' }], [{ amount: 0.3, status: 'settled' }], 0);
    expect(r.variance).toBe(0);
  });
});
