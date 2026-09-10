const { prisma } = require('../../shared/database');
const { computeTcs } = require('./tcs');

/**
 * TCS / GSTR-8-style settlement reporting (Phase G).
 *
 * Aggregates the taxable value of supplies made through the marketplace per
 * store over a period (from generated tax invoices) and computes the TCS the
 * platform must collect/deposit (0.5%). Reporting/computation only — no filing.
 */

const num = (d) => (d == null ? 0 : Number(d));

/**
 * Per-store TCS report for a period.
 * @param {object} p { from, to } ISO dates (defaults: current month)
 * @returns {Promise<{period, stores:[{storeId, storeName, gstin, netTaxableValue, tcsCgst, tcsSgst, tcsIgst, tcsTotal, invoiceCount}], totals}>}
 */
async function gstr8Report({ from, to } = {}) {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(to) : now;

  // Tax invoices in the window (Bill of Supply carries no tax and no TCS).
  const invoices = await prisma.invoice.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      docType: 'TAX_INVOICE',
    },
    select: {
      storeId: true,
      taxableValue: true,
      totalIgst: true,
      placeOfSupplyState: true,
      store: { select: { name: true, gstNumber: true, stateCode: true } },
    },
  });

  // Group by store; a store may have both intra and inter supplies → track each
  // net separately so TCS splits correctly.
  const byStore = new Map();
  for (const inv of invoices) {
    const s = byStore.get(inv.storeId) || {
      storeName: inv.store?.name, gstin: inv.store?.gstNumber || null,
      intraNet: 0, interNet: 0, invoiceCount: 0,
    };
    const isInter = num(inv.totalIgst) > 0
      || (inv.placeOfSupplyState != null && inv.store?.stateCode != null
          && Number(inv.placeOfSupplyState) !== Number(inv.store.stateCode));
    if (isInter) s.interNet += num(inv.taxableValue);
    else s.intraNet += num(inv.taxableValue);
    s.invoiceCount += 1;
    byStore.set(inv.storeId, s);
  }

  const stores = [];
  const totals = { netTaxableValue: 0, tcsCgst: 0, tcsSgst: 0, tcsIgst: 0, tcsTotal: 0 };
  for (const [storeId, s] of byStore.entries()) {
    const intra = computeTcs(s.intraNet, false);
    const inter = computeTcs(s.interNet, true);
    const row = {
      storeId, storeName: s.storeName, gstin: s.gstin,
      netTaxableValue: Math.round((s.intraNet + s.interNet) * 100) / 100,
      tcsCgst: intra.tcsCgst,
      tcsSgst: intra.tcsSgst,
      tcsIgst: inter.tcsIgst,
      tcsTotal: Math.round((intra.tcsTotal + inter.tcsTotal) * 100) / 100,
      invoiceCount: s.invoiceCount,
    };
    stores.push(row);
    totals.netTaxableValue += row.netTaxableValue;
    totals.tcsCgst += row.tcsCgst;
    totals.tcsSgst += row.tcsSgst;
    totals.tcsIgst += row.tcsIgst;
    totals.tcsTotal += row.tcsTotal;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  Object.keys(totals).forEach((k) => { totals[k] = round2(totals[k]); });

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    stores: stores.sort((a, b) => b.tcsTotal - a.tcsTotal),
    totals,
  };
}

module.exports = { gstr8Report };
