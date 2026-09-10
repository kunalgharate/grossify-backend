const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError } = require('../../shared/errors');
const { calculateBill } = require('./gst-engine');

/**
 * Tax service — the impure wrapper around the pure `gst-engine`.
 *
 * Responsibilities (see `.kiro/specs/billing-b0/design.md` §2.3–2.4):
 *   - resolveRate: effective-dated GST rate lookup with fallback
 *   - assertSaleAllowed: GSTIN / scheme policy gate (kept OUT of the pure engine)
 *   - quoteOrder: build engine input from order lines + store, return totals
 *   - allocateInvoiceNumber: atomic per-store-per-FY numbering (row lock)
 *   - finalizeInvoice: persist a split-tax Invoice + snapshot OrderItem tax
 */

// ── Financial year (India: 1 Apr – 31 Mar), e.g. 2026-02-10 -> "2025-26" ──
function financialYearOf(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1..12
  const startYear = m >= 4 ? y : y - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

/**
 * Resolve the GST rate (%) effective on `date`, preferring an HSN-specific row,
 * then the active regime default for that HSN's absence. Returns a number.
 *
 * @param {string|null} hsnCode
 * @param {Date} [date]
 * @param {number} [fallback] rate to use when nothing matches (default 0)
 */
async function resolveRate(hsnCode, date = new Date(), fallback = 0) {
  const dateFilter = {
    effectiveFrom: { lte: date },
    OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
  };

  if (hsnCode) {
    const specific = await prisma.gstRate.findFirst({
      where: { hsnCode, ...dateFilter },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (specific) return Number(specific.rate);
  }
  // No HSN-specific row: caller supplies the product/category/store default.
  return fallback;
}

/**
 * GSTIN / scheme policy gate. Kept separate from the pure engine.
 *
 * Rules (PRD R9, R-TAX-4):
 *   - inter-state supply without a GSTIN is blocked (legal).
 *   - intra-state supply without a GSTIN is allowed as UNREGISTERED (Bill of Supply).
 *   - COMPOSITION cannot supply inter-state.
 *
 * @returns {{gstScheme: string, isInterState: boolean}}
 */
function assertSaleAllowed(store, placeOfSupplyStateCode) {
  const supplierState = store.stateCode ?? null;
  const posState = placeOfSupplyStateCode ?? supplierState;
  const isInterState =
    supplierState != null && posState != null && Number(supplierState) !== Number(posState);

  const hasGstin = Boolean(store.gstNumber && String(store.gstNumber).trim());
  let scheme = store.gstScheme || (hasGstin ? 'REGULAR' : 'UNREGISTERED');

  if (isInterState) {
    if (!hasGstin) {
      throw new BadRequestError(
        'GSTIN_REQUIRED: inter-state supply requires a registered GSTIN',
        'GSTIN_REQUIRED'
      );
    }
    if (scheme === 'COMPOSITION') {
      throw new BadRequestError(
        'COMPOSITION_INTERSTATE: a composition dealer cannot make inter-state supplies',
        'COMPOSITION_INTERSTATE'
      );
    }
  }

  return { gstScheme: scheme, isInterState };
}

/**
 * Build the pure-engine input for an order and return the computed tax.
 * Used by POST /tax/quote and by finalizeInvoice.
 *
 * @param {object} params
 * @param {object} params.store           { stateCode, gstScheme, gstNumber, restaurantTaxProfile }
 * @param {number} params.placeOfSupplyStateCode
 * @param {Array} params.lines            [{ qty, unitPrice, rate?, hsnSac?, isTaxInclusive?, cessRate?, lineDiscount? }]
 * @param {object|null} [params.billDiscount]
 * @param {Date} [params.date]
 */
async function quoteOrder({ store, placeOfSupplyStateCode, lines, billDiscount = null, date = new Date() }) {
  if (!store) throw new BadRequestError('store is required for a tax quote');
  const { gstScheme } = assertSaleAllowed(store, placeOfSupplyStateCode);

  const restaurantRate =
    store.vendorType === 'RESTAURANT' && store.restaurantTaxProfile
      ? Number(store.restaurantTaxProfile.rate)
      : null;

  // Resolve each line's rate: explicit > restaurant profile > HSN master > 0.
  const resolvedLines = [];
  for (const l of lines) {
    let rate = l.rate;
    if (rate == null) {
      if (restaurantRate != null) rate = restaurantRate;
      else rate = await resolveRate(l.hsnSac || null, date, 0);
    }
    resolvedLines.push({
      qty: l.qty,
      unitPrice: l.unitPrice,
      rate: Number(rate) || 0,
      cessRate: l.cessRate || 0,
      isTaxInclusive: Boolean(l.isTaxInclusive),
      lineDiscount: l.lineDiscount || null,
      hsnSac: l.hsnSac || null,
      uqc: l.uqc || null,
    });
  }

  const supplierStateCode = store.stateCode ?? placeOfSupplyStateCode;
  return calculateBill({
    supplierStateCode,
    placeOfSupplyStateCode: placeOfSupplyStateCode ?? supplierStateCode,
    gstScheme,
    billDiscount,
    lines: resolvedLines,
  });
}

/**
 * Atomically allocate the next invoice number for (store, FY, docType).
 * MUST run inside a prisma.$transaction. Locks the InvoiceSeries row with
 * SELECT ... FOR UPDATE so concurrent invoices never collide or skip
 * (mirrors the proven pattern in products/inventory.service.js).
 *
 * @returns {Promise<{invoiceNumber: string, financialYear: string}>}
 */
async function allocateInvoiceNumber(tx, storeId, financialYear, docType = 'TAX_INVOICE', prefix = 'INV') {
  const rows = await tx.$queryRaw`
    SELECT id, prefix, next_number AS "nextNumber"
    FROM invoice_series
    WHERE store_id = ${storeId}
      AND financial_year = ${financialYear}
      AND doc_type = ${docType}::"InvoiceDocType"
    FOR UPDATE
  `;

  let seriesId;
  let usedPrefix = prefix;
  let seq;

  if (rows.length === 0) {
    // First invoice for this (store, FY, docType): create the series at 1.
    const created = await tx.invoiceSeries.create({
      data: { storeId, financialYear, docType, prefix, nextNumber: 2 },
    });
    seriesId = created.id;
    seq = 1;
  } else {
    seriesId = rows[0].id;
    usedPrefix = rows[0].prefix || prefix;
    seq = Number(rows[0].nextNumber);
    await tx.invoiceSeries.update({
      where: { id: seriesId },
      data: { nextNumber: seq + 1 },
    });
  }

  // Format: PREFIX-YYYY-NNNN (compact FY, zero-padded seq). Kept <= 16 chars.
  const fyCompact = financialYear.replace('-', '').slice(0, 4) + financialYear.slice(-2);
  const invoiceNumber = `${usedPrefix}-${fyCompact}-${String(seq).padStart(4, '0')}`;
  return { invoiceNumber, financialYear };
}

/**
 * Generate a GST-correct invoice for an order and snapshot per-line tax onto
 * its order items. Idempotent: returns the existing invoice if present.
 *
 * @param {string} orderId
 * @returns {Promise<object>} the invoice
 */
async function finalizeInvoice(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { hsn: true, unit: true } } } },
      store: true,
      address: { select: { stateCode: true } },
    },
  });
  if (!order) throw new NotFoundError('Order not found');

  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing) return existing;

  const store = order.store;
  // Place of supply (GST): for an ONLINE order shipped to a delivery address,
  // it is the delivery address's state (may be inter-state → IGST). For offline
  // POS / counter / when the address has no state code, it is the store's state.
  let posState = store.stateCode;
  if (order.channel === 'ONLINE' && order.address?.stateCode != null) {
    posState = order.address.stateCode;
  }

  const lines = order.items.map((it) => ({
    qty: it.quantity,
    unitPrice: Number(it.unitPrice),
    hsnSac: it.hsnSac || it.product?.hsn || null,
    uqc: it.uqc || it.product?.unit || null,
    isTaxInclusive: it.isTaxInclusive || false,
  }));

  const quote = await quoteOrder({
    store,
    placeOfSupplyStateCode: posState,
    lines,
    date: order.placedAt || new Date(),
  });

  const fy = financialYearOf(order.placedAt || new Date());
  const docType = quote.isBillOfSupply ? 'BILL_OF_SUPPLY' : 'TAX_INVOICE';

  return prisma.$transaction(async (tx) => {
    const { invoiceNumber } = await allocateInvoiceNumber(tx, store.id, fy, docType);

    // Snapshot per-line tax onto the order items (immutable historical record).
    for (let i = 0; i < order.items.length; i += 1) {
      const it = order.items[i];
      const q = quote.lines[i];
      await tx.orderItem.update({
        where: { id: it.id },
        data: {
          taxRate: q.taxRate,
          taxableValue: q.taxableValue,
          cgst: q.cgst,
          sgst: q.sgst,
          igst: q.igst,
          cessAmount: q.cessAmount,
          lineTotal: q.lineTotal,
          hsnSac: it.hsnSac || it.product?.hsn || null,
          uqc: it.uqc || it.product?.unit || null,
          isTaxInclusive: it.isTaxInclusive || false,
        },
      });
    }

    // Update order-level tax aggregates.
    await tx.order.update({
      where: { id: order.id },
      data: {
        taxableSubtotal: quote.totals.taxableSubtotal,
        totalCgst: quote.totals.totalCgst,
        totalSgst: quote.totals.totalSgst,
        totalIgst: quote.totals.totalIgst,
        roundOff: quote.totals.roundOff,
      },
    });

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        storeId: store.id,
        customerId: order.customerId,
        financialYear: fy,
        docType,
        subtotal: order.subtotal,
        convenienceFee: order.convenienceFee,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        taxAmount: quote.totals.totalCgst + quote.totals.totalSgst + quote.totals.totalIgst,
        taxableValue: quote.totals.taxableSubtotal,
        totalCgst: quote.totals.totalCgst,
        totalSgst: quote.totals.totalSgst,
        totalIgst: quote.totals.totalIgst,
        cessAmount: quote.totals.cessAmount,
        roundOff: quote.totals.roundOff,
        placeOfSupplyState: posState ?? null,
        buyerGstin: order.customerGstin || null,
        rateWiseSummary: quote.rateWiseSummary,
        total: order.total,
        status: order.paymentStatus === 'PAID' ? 'paid' : 'generated',
        paidAt: order.paymentStatus === 'PAID' ? new Date() : null,
      },
    });

    return invoice;
  });
}

module.exports = {
  financialYearOf,
  resolveRate,
  assertSaleAllowed,
  quoteOrder,
  allocateInvoiceNumber,
  finalizeInvoice,
};
