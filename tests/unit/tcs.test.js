const { computeTcs } = require('../../src/modules/settlements/tcs');

describe('computeTcs (GST Sec 52, 0.5%)', () => {
  it('intra-state → 0.25% CGST + 0.25% SGST, summing to 0.5%', () => {
    const r = computeTcs(10000, false); // ₹10,000 net
    expect(r.tcsCgst).toBe(25);
    expect(r.tcsSgst).toBe(25);
    expect(r.tcsIgst).toBe(0);
    expect(r.tcsTotal).toBe(50);
    expect(r.tcsCgst + r.tcsSgst).toBe(r.tcsTotal);
  });

  it('inter-state → 0.5% IGST, no CGST/SGST', () => {
    const r = computeTcs(10000, true);
    expect(r.tcsIgst).toBe(50);
    expect(r.tcsCgst).toBe(0);
    expect(r.tcsSgst).toBe(0);
    expect(r.tcsTotal).toBe(50);
  });

  it('odd amount: CGST+SGST halves still sum to total', () => {
    const r = computeTcs(333.33, false); // 0.5% = 1.66665 -> 1.67
    expect(Number((r.tcsCgst + r.tcsSgst).toFixed(2))).toBe(r.tcsTotal);
  });

  it('negative/zero net → zero TCS', () => {
    expect(computeTcs(0, false).tcsTotal).toBe(0);
    expect(computeTcs(-500, true).tcsTotal).toBe(0);
  });
});
