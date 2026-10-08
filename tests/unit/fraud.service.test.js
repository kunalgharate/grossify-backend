const { scoreFromStats } = require('../../src/modules/admin/fraud.service');

describe('fraud.scoreFromStats', () => {
  it('a clean customer scores LOW / ALLOW', () => {
    const r = scoreFromStats({ totalOrders: 10, rtoOrders: 0, returnedOrders: 1, cancelledOrders: 0 });
    expect(r.level).toBe('LOW');
    expect(r.recommendation).toBe('ALLOW');
    expect(r.flags).toHaveLength(0);
  });

  it('flags a high RTO rate', () => {
    const r = scoreFromStats({ totalOrders: 10, rtoOrders: 5 });
    expect(r.flags).toContain('HIGH_RTO_RATE');
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it('flags a serial returner', () => {
    const r = scoreFromStats({ totalOrders: 10, returnedOrders: 6 });
    expect(r.flags).toContain('SERIAL_RETURNER');
  });

  it('flags rapid orders (card-testing / promo abuse)', () => {
    const r = scoreFromStats({ totalOrders: 20, ordersLastHour: 6 });
    expect(r.flags).toContain('RAPID_ORDERS');
  });

  it('stacks signals into HIGH / BLOCK_OR_REVIEW', () => {
    const r = scoreFromStats({
      totalOrders: 10,
      rtoOrders: 5,
      returnedOrders: 6,
      cancelledOrders: 6,
      ordersLastHour: 6,
    });
    expect(r.level).toBe('HIGH');
    expect(r.recommendation).toBe('BLOCK_OR_REVIEW');
    expect(r.score).toBe(100);
  });

  it('does not flag low-volume customers (needs >=5 orders)', () => {
    const r = scoreFromStats({ totalOrders: 2, rtoOrders: 2, returnedOrders: 2 });
    expect(r.flags).toHaveLength(0);
    expect(r.level).toBe('LOW');
  });
});
