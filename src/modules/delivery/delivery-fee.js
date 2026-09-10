/**
 * Delivery-fee calculator — PURE (no DB/IO), the single source of truth for how
 * a delivery fee is split between store, customer, Grossify, and the delivery
 * partner. Integer-paise math to avoid float drift.
 *
 * Business rules (confirmed):
 *  - Fulfilment mode is per order:
 *      SELF     → the store delivers; Grossify charges nothing on delivery.
 *      GROSSIFY → the store uses Grossify's delivery pool; the fee below applies.
 *  - For GROSSIFY delivery the fee is split into TWO sides, each with a
 *    minimum of ₹20 (distance may raise a side above the minimum):
 *      store side + customer side = the delivery POOL (e.g. 20 + 20 = ₹40).
 *  - Grossify commission = commissionPct of the POOL (default 5% → ₹2 of ₹40).
 *  - Delivery partner payout = POOL − Grossify commission (e.g. 40 − 2 = ₹38).
 *  - Free-above-threshold: if the store advertises free delivery above an order
 *    value, and the order qualifies, the CUSTOMER pays ₹0 and the STORE bears
 *    the whole pool (both sides). Grossify still takes its commission from the
 *    pool; the partner still gets the remainder.
 *
 * The POOL is unchanged by who pays it — only the store/customer split changes.
 */

const toPaise = (r) => Math.round(Number(r) * 100);
const toRupees = (p) => Math.round(p) / 100;

/**
 * @param {object} input
 * @param {'SELF'|'GROSSIFY'} input.mode                 fulfilment mode
 * @param {number} [input.orderValue=0]                  goods subtotal (for free-threshold test)
 * @param {number} [input.minPerSide=20]                 minimum ₹ per side
 * @param {number} [input.storeSideFee]                  store-side fee (defaults to minPerSide)
 * @param {number} [input.customerSideFee]               customer-side fee (defaults to minPerSide)
 * @param {number|null} [input.freeDeliveryAbove=null]   store threshold; null/absent = no free delivery
 * @param {number} [input.commissionPct=5]               Grossify % of the pool
 * @returns {{
 *   mode:string, isFree:boolean,
 *   storeShare:number, customerShare:number, pool:number,
 *   platformCommission:number, partnerPayout:number
 * }}
 */
function computeDeliveryFee(input) {
  const {
    mode,
    orderValue = 0,
    minPerSide = 20,
    storeSideFee,
    customerSideFee,
    freeDeliveryAbove = null,
    commissionPct = 5,
  } = input || {};

  // SELF delivery: no delivery fee flows through Grossify at all.
  if (mode === 'SELF') {
    return {
      mode: 'SELF', isFree: false,
      storeShare: 0, customerShare: 0, pool: 0,
      platformCommission: 0, partnerPayout: 0,
    };
  }
  if (mode !== 'GROSSIFY') {
    throw new Error(`computeDeliveryFee: mode must be SELF or GROSSIFY (got ${mode})`);
  }

  // Each side is at least the minimum; distance may raise it.
  const minP = toPaise(minPerSide);
  const storeSideP = Math.max(storeSideFee != null ? toPaise(storeSideFee) : minP, minP);
  const customerSideP = Math.max(customerSideFee != null ? toPaise(customerSideFee) : minP, minP);
  const poolP = storeSideP + customerSideP;

  // Grossify commission = pct of the pool; partner gets the rest.
  const commissionP = Math.round((poolP * Number(commissionPct)) / 100);
  const partnerP = poolP - commissionP;

  // Free-above-threshold: customer pays 0, store bears the whole pool.
  const qualifiesFree =
    freeDeliveryAbove != null && Number(orderValue) >= Number(freeDeliveryAbove);

  let storeShareP;
  let customerShareP;
  if (qualifiesFree) {
    storeShareP = poolP;
    customerShareP = 0;
  } else {
    storeShareP = storeSideP;
    customerShareP = customerSideP;
  }

  return {
    mode: 'GROSSIFY',
    isFree: qualifiesFree,
    storeShare: toRupees(storeShareP),
    customerShare: toRupees(customerShareP),
    pool: toRupees(poolP),
    platformCommission: toRupees(commissionP),
    partnerPayout: toRupees(partnerP),
  };
}

module.exports = { computeDeliveryFee };
