/**
 * GST tax engine — PURE calculation core (no DB, no IO, deterministic).
 *
 * Implements the Grossify Billing B0 tax rules (see `.kiro/specs/billing-b0/`
 * and `Grossify-Billing-Inventory-PRD.md` §6):
 *   - intra-state supply  -> CGST + SGST, each = tax / 2
 *   - inter-state supply  -> IGST = full tax
 *   - inclusive vs exclusive pricing (MRP is tax-inclusive; back-calc taxable)
 *   - line-level discount is PRE-tax (reduces taxable value)
 *   - bill-level discount is POST-tax (reduces amount payable, not taxable value)
 *   - round-off applied at the INVOICE TOTAL to the nearest rupee (Sec 170)
 *   - UNREGISTERED / COMPOSITION -> Bill of Supply, zero tax
 *
 * MONEY REPRESENTATION: all internal arithmetic uses INTEGER PAISE to avoid
 * floating-point drift (the backend has no decimal library). Inputs are rupee
 * numbers; outputs are rupee numbers rounded to 2 decimals at the boundary.
 */

const SCHEMES_WITHOUT_TAX = new Set(['UNREGISTERED', 'COMPOSITION']);

// ── paise helpers ─────────────────────────────────────────────────────────
/** Rupees (may be fractional) -> integer paise, rounded half-up. */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
/** Integer paise -> rupee number with 2 decimals. */
const toRupees = (paise) => Math.round(paise) / 100;
/** Round a fractional paise value to whole paise (half-up on magnitude). */
const roundPaise = (paise) => Math.sign(paise) * Math.round(Math.abs(paise));

/**
 * Apply a discount to a paise amount. `{ type: 'PERCENT'|'FLAT', value }`.
 * PERCENT value is a percentage (e.g. 10 = 10%); FLAT value is in rupees.
 * Never returns below zero.
 */
function discountPaise(basePaise, discount) {
  if (!discount || !discount.value) return 0;
  let d;
  if (discount.type === 'PERCENT') {
    d = roundPaise((basePaise * Number(discount.value)) / 100);
  } else {
    d = toPaise(discount.value); // FLAT, in rupees
  }
  return Math.min(Math.max(d, 0), basePaise);
}

/**
 * Calculate a full bill.
 *
 * @param {object} input
 * @param {number} input.supplierStateCode        GST state code of the supplier (store)
 * @param {number} input.placeOfSupplyStateCode   GST state code of the place of supply
 * @param {string} input.gstScheme                REGULAR | COMPOSITION | UNREGISTERED
 * @param {{type:'PERCENT'|'FLAT',value:number}|null} [input.billDiscount]
 * @param {Array<object>} input.lines
 *   each line: { qty, unitPrice, rate, cessRate?, isTaxInclusive?,
 *                lineDiscount?, hsnSac?, uqc? }
 * @returns {object} { isBillOfSupply, isInterState, lines[], totals, rateWiseSummary[] }
 */
function calculateBill(input) {
  const {
    supplierStateCode,
    placeOfSupplyStateCode,
    gstScheme = 'REGULAR',
    billDiscount = null,
    lines = [],
  } = input || {};

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('calculateBill: at least one line is required');
  }

  const isBillOfSupply = SCHEMES_WITHOUT_TAX.has(gstScheme);
  // Bill of Supply carries no tax at all, so intra/inter is irrelevant to the split.
  const isInterState =
    !isBillOfSupply && Number(supplierStateCode) !== Number(placeOfSupplyStateCode);

  const outLines = [];
  const rateMap = new Map(); // rate -> {taxableP, cgstP, sgstP, igstP, cessP}

  let taxableSubtotalP = 0;
  let totalCgstP = 0;
  let totalSgstP = 0;
  let totalIgstP = 0;
  let totalCessP = 0;

  for (const line of lines) {
    const qty = Number(line.qty);
    const unitPriceP = toPaise(line.unitPrice);
    const rate = isBillOfSupply ? 0 : Number(line.rate) || 0;
    const cessRate = isBillOfSupply ? 0 : Number(line.cessRate) || 0;
    const inclusive = Boolean(line.isTaxInclusive);

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('calculateBill: line qty must be a positive number');
    }

    const grossP = roundPaise(unitPriceP * qty);
    const lineDiscP = discountPaise(grossP, line.lineDiscount);
    const netP = grossP - lineDiscP; // amount after pre-tax line discount

    let taxableP;
    let taxP;

    if (isBillOfSupply || rate === 0) {
      taxableP = netP;
      taxP = 0;
    } else if (inclusive) {
      // taxable = inclusive * 100 / (100 + rate); tax = inclusive - taxable
      taxableP = roundPaise((netP * 100) / (100 + rate));
      taxP = netP - taxableP;
    } else {
      taxableP = netP;
      taxP = roundPaise((taxableP * rate) / 100);
    }

    const cessP = isBillOfSupply ? 0 : roundPaise((taxableP * cessRate) / 100);

    // Split LAST.
    let cgstP = 0;
    let sgstP = 0;
    let igstP = 0;
    if (taxP > 0) {
      if (isInterState) {
        igstP = taxP;
      } else {
        cgstP = roundPaise(taxP / 2);
        sgstP = taxP - cgstP; // keep the pair summing exactly to taxP
      }
    }

    // Inclusive lines: the line total is exactly the (discounted) inclusive amount.
    const lineTotalP = inclusive && !isBillOfSupply && rate !== 0
      ? netP + cessP
      : taxableP + taxP + cessP;

    taxableSubtotalP += taxableP;
    totalCgstP += cgstP;
    totalSgstP += sgstP;
    totalIgstP += igstP;
    totalCessP += cessP;

    // rate-wise summary
    const key = String(rate);
    const agg = rateMap.get(key) || { taxableP: 0, cgstP: 0, sgstP: 0, igstP: 0, cessP: 0 };
    agg.taxableP += taxableP;
    agg.cgstP += cgstP;
    agg.sgstP += sgstP;
    agg.igstP += igstP;
    agg.cessP += cessP;
    rateMap.set(key, agg);

    outLines.push({
      taxRate: rate,
      hsnSac: line.hsnSac || null,
      uqc: line.uqc || null,
      isTaxInclusive: inclusive,
      taxableValue: toRupees(taxableP),
      cgst: toRupees(cgstP),
      sgst: toRupees(sgstP),
      igst: toRupees(igstP),
      cessAmount: toRupees(cessP),
      lineTotal: toRupees(lineTotalP),
    });
  }

  const totalTaxP = totalCgstP + totalSgstP + totalIgstP + totalCessP;
  const preDiscountTotalP = taxableSubtotalP + totalTaxP;

  // Bill-level discount is POST-tax: reduces payable, not taxable value.
  const billDiscP = discountPaise(preDiscountTotalP, billDiscount);
  const preRoundTotalP = preDiscountTotalP - billDiscP;

  // Round-off at the invoice total to the nearest rupee (Sec 170).
  const grandTotalP = Math.round(preRoundTotalP / 100) * 100;
  const roundOffP = grandTotalP - preRoundTotalP; // ∈ (-50, +50] paise

  const rateWiseSummary = [...rateMap.entries()]
    .map(([rate, a]) => ({
      rate: Number(rate),
      taxableValue: toRupees(a.taxableP),
      cgst: toRupees(a.cgstP),
      sgst: toRupees(a.sgstP),
      igst: toRupees(a.igstP),
      cess: toRupees(a.cessP),
    }))
    .sort((x, y) => x.rate - y.rate);

  return {
    isBillOfSupply,
    isInterState,
    lines: outLines,
    totals: {
      taxableSubtotal: toRupees(taxableSubtotalP),
      totalCgst: toRupees(totalCgstP),
      totalSgst: toRupees(totalSgstP),
      totalIgst: toRupees(totalIgstP),
      cessAmount: toRupees(totalCessP),
      billDiscount: toRupees(billDiscP),
      preRoundTotal: toRupees(preRoundTotalP),
      roundOff: toRupees(roundOffP),
      grandTotal: toRupees(grandTotalP),
    },
    rateWiseSummary,
  };
}

module.exports = { calculateBill };
