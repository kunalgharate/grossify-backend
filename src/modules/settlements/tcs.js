/**
 * GST TCS (Tax Collected at Source, CGST Sec 52) — PURE calculator.
 *
 * A marketplace (e-commerce operator) must collect TCS at 0.5% of the NET value
 * of taxable supplies made through it by each vendor, and report it in GSTR-8.
 * Net value = gross taxable supplies − supplies returned in the period.
 *
 * Rate split mirrors GST itself:
 *   intra-state supply → 0.25% CGST + 0.25% SGST (= 0.5% total)
 *   inter-state supply → 0.5% IGST
 *
 * TCS is collected at SETTLEMENT and is NOT shown on the customer invoice — it's
 * withheld from the vendor's payout and deposited by the platform. This module
 * computes it and produces GSTR-8-style figures; it does not file.
 *
 * Integer-paise math.
 */

const TCS_TOTAL_RATE = 0.5; // percent

const toPaise = (r) => Math.round(Number(r) * 100);
const toRupees = (p) => Math.round(p) / 100;

/**
 * Compute TCS on a net taxable value.
 * @param {number} netTaxableValue  gross taxable supplies − returns (rupees)
 * @param {boolean} isInterState
 * @returns {{netTaxableValue:number, tcsCgst:number, tcsSgst:number, tcsIgst:number, tcsTotal:number}}
 */
function computeTcs(netTaxableValue, isInterState = false) {
  const netP = Math.max(toPaise(netTaxableValue), 0);
  const totalP = Math.round((netP * TCS_TOTAL_RATE) / 100);

  if (isInterState) {
    return {
      netTaxableValue: toRupees(netP),
      tcsCgst: 0, tcsSgst: 0,
      tcsIgst: toRupees(totalP),
      tcsTotal: toRupees(totalP),
    };
  }
  // Intra-state: split the 0.5% into equal CGST + SGST halves (sum == total).
  const cgstP = Math.round(totalP / 2);
  const sgstP = totalP - cgstP;
  return {
    netTaxableValue: toRupees(netP),
    tcsCgst: toRupees(cgstP),
    tcsSgst: toRupees(sgstP),
    tcsIgst: 0,
    tcsTotal: toRupees(totalP),
  };
}

module.exports = { computeTcs, TCS_TOTAL_RATE };
