// Fully DB-free: the GST engine is a pure module with no imports of the
// Prisma singleton, so it can be required and exercised directly.
const { calculateBill } = require('../../src/modules/tax/gst-engine');

// State codes (GST): Maharashtra 27, Gujarat 24, Rajasthan 08.
const MH = 27;
const GJ = 24;
const RJ = 8;

describe('gst-engine.calculateBill', () => {
  // ── PRD §6.9 acceptance oracles ─────────────────────────────────────────
  describe('PRD §6.9 worked examples', () => {
    it('A — intra-state, exclusive, mixed rates → CGST 37 + SGST 37, total ₹774', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [
          { qty: 2, unitPrice: 200, rate: 5, hsnSac: '1101' },   // taxable 400, tax 20
          { qty: 1, unitPrice: 300, rate: 18, hsnSac: '3305' },  // taxable 300, tax 54
        ],
      });

      expect(r.isInterState).toBe(false);
      expect(r.isBillOfSupply).toBe(false);
      expect(r.totals.taxableSubtotal).toBe(700);
      expect(r.totals.totalCgst).toBe(37);   // (10) + (27)
      expect(r.totals.totalSgst).toBe(37);
      expect(r.totals.totalIgst).toBe(0);
      expect(r.totals.roundOff).toBe(0);
      expect(r.totals.grandTotal).toBe(774);
    });

    it('B — inter-state, exclusive → IGST 2879.82, round-off +0.18, total ₹18879', () => {
      const r = calculateBill({
        supplierStateCode: GJ,
        placeOfSupplyStateCode: RJ,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 15999, rate: 18, hsnSac: '8517' }],
      });

      expect(r.isInterState).toBe(true);
      expect(r.totals.totalIgst).toBeCloseTo(2879.82, 2);
      expect(r.totals.totalCgst).toBe(0);
      expect(r.totals.totalSgst).toBe(0);
      expect(r.totals.preRoundTotal).toBeCloseTo(18878.82, 2);
      expect(r.totals.roundOff).toBeCloseTo(0.18, 2);
      expect(r.totals.grandTotal).toBe(18879);
    });

    it('C — restaurant, intra-state, inclusive 5% → taxable 500, CGST 12.50 + SGST 12.50, total ₹525', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 525, rate: 5, isTaxInclusive: true, hsnSac: '9963' }],
      });

      expect(r.totals.taxableSubtotal).toBe(500);
      expect(r.totals.totalCgst).toBe(12.5);
      expect(r.totals.totalSgst).toBe(12.5);
      expect(r.totals.totalIgst).toBe(0);
      expect(r.totals.grandTotal).toBe(525);
      expect(r.lines[0].lineTotal).toBe(525);
    });

    it('D — Bill of Supply (unregistered) → zero tax, item value only', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'UNREGISTERED',
        lines: [{ qty: 3, unitPrice: 100, rate: 5 }], // rate ignored
      });

      expect(r.isBillOfSupply).toBe(true);
      expect(r.totals.taxableSubtotal).toBe(300);
      expect(r.totals.totalCgst).toBe(0);
      expect(r.totals.totalSgst).toBe(0);
      expect(r.totals.totalIgst).toBe(0);
      expect(r.totals.grandTotal).toBe(300);
      expect(r.lines[0].taxRate).toBe(0);
    });
  });

  // ── Split logic ─────────────────────────────────────────────────────────
  describe('intra vs inter-state split', () => {
    it('CGST and SGST are exactly half and sum to the total tax (odd paise)', () => {
      // taxable 100.01 @18% = 18.0018 -> 18.00; halves must sum back to 18.00
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 100.01, rate: 18 }],
      });
      const { totalCgst, totalSgst } = r.totals;
      expect(Number((totalCgst + totalSgst).toFixed(2))).toBe(18.0);
    });

    it('composition scheme also produces a Bill of Supply with no tax', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: GJ, // even inter-state, no tax for BoS
        gstScheme: 'COMPOSITION',
        lines: [{ qty: 1, unitPrice: 1000, rate: 18 }],
      });
      expect(r.isBillOfSupply).toBe(true);
      expect(r.totals.totalIgst).toBe(0);
      expect(r.totals.grandTotal).toBe(1000);
    });
  });

  // ── Discounts ─────────────────────────────────────────────────────────
  describe('discounts', () => {
    it('line discount is PRE-tax (reduces taxable value)', () => {
      // 100 - 10 = 90 taxable @5% -> tax 4.50
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [
          { qty: 1, unitPrice: 100, rate: 5, lineDiscount: { type: 'FLAT', value: 10 } },
        ],
      });
      expect(r.totals.taxableSubtotal).toBe(90);
      expect(r.totals.totalCgst).toBe(2.25);
      expect(r.totals.totalSgst).toBe(2.25);
      expect(r.totals.grandTotal).toBe(95); // 90 + 4.50 = 94.50 -> round 95
    });

    it('bill discount is POST-tax (does not change taxable value or tax)', () => {
      // taxable 100 @5% -> tax 5 -> preDiscount 105; bill FLAT 10 -> 95
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 100, rate: 5 }],
        billDiscount: { type: 'FLAT', value: 10 },
      });
      expect(r.totals.taxableSubtotal).toBe(100);
      expect(r.totals.totalCgst).toBe(2.5);
      expect(r.totals.totalSgst).toBe(2.5);
      expect(r.totals.billDiscount).toBe(10);
      expect(r.totals.grandTotal).toBe(95);
    });

    it('percent line discount', () => {
      // 200 - 10% = 180 taxable @18% -> tax 32.40
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [
          { qty: 1, unitPrice: 200, rate: 18, lineDiscount: { type: 'PERCENT', value: 10 } },
        ],
      });
      expect(r.totals.taxableSubtotal).toBe(180);
      expect(r.totals.totalIgst).toBe(0);
      expect(Number((r.totals.totalCgst + r.totals.totalSgst).toFixed(2))).toBe(32.4);
    });
  });

  // ── Cess + rate-wise summary ──────────────────────────────────────────
  describe('cess and rate-wise summary', () => {
    it('adds cess on top of the slab', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 1000, rate: 28, cessRate: 12 }],
      });
      expect(r.totals.cessAmount).toBe(120); // 12% of 1000
      expect(r.totals.totalCgst).toBe(140);  // 14% of 1000
      expect(r.totals.totalSgst).toBe(140);
      expect(r.totals.grandTotal).toBe(1400); // 1000 + 280 + 120
    });

    it('groups the rate-wise summary by slab', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [
          { qty: 1, unitPrice: 100, rate: 5 },
          { qty: 1, unitPrice: 100, rate: 5 },
          { qty: 1, unitPrice: 100, rate: 18 },
        ],
      });
      expect(r.rateWiseSummary).toHaveLength(2);
      const five = r.rateWiseSummary.find((s) => s.rate === 5);
      const eighteen = r.rateWiseSummary.find((s) => s.rate === 18);
      expect(five.taxableValue).toBe(200);
      expect(eighteen.taxableValue).toBe(100);
    });
  });

  // ── Rounding boundaries ───────────────────────────────────────────────
  describe('round-off (Sec 170)', () => {
    it('rounds down when fractional part < 0.50', () => {
      // taxable 100 @5% -> 105.00 exact -> no round; use a .40 case
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 102.4, rate: 0 }],
      });
      expect(r.totals.preRoundTotal).toBe(102.4);
      expect(r.totals.roundOff).toBeCloseTo(-0.4, 2);
      expect(r.totals.grandTotal).toBe(102);
    });

    it('rounds up when fractional part >= 0.50', () => {
      const r = calculateBill({
        supplierStateCode: MH,
        placeOfSupplyStateCode: MH,
        gstScheme: 'REGULAR',
        lines: [{ qty: 1, unitPrice: 102.5, rate: 0 }],
      });
      expect(r.totals.roundOff).toBeCloseTo(0.5, 2);
      expect(r.totals.grandTotal).toBe(103);
    });
  });

  // ── Guards ────────────────────────────────────────────────────────────
  describe('input validation', () => {
    it('throws when there are no lines', () => {
      expect(() => calculateBill({ supplierStateCode: MH, placeOfSupplyStateCode: MH, lines: [] }))
        .toThrow(/at least one line/);
    });

    it('throws on non-positive qty', () => {
      expect(() =>
        calculateBill({
          supplierStateCode: MH,
          placeOfSupplyStateCode: MH,
          lines: [{ qty: 0, unitPrice: 100, rate: 5 }],
        })
      ).toThrow(/positive number/);
    });
  });
});
