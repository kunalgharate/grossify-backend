const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const inventoryService = require('../products/inventory.service');
const stockLedger = require('../inventory/inventory.service');
const taxService = require('../tax/tax.service');

/**
 * POS service — offline-capable counter billing.
 *
 * The core entry is `syncBill`, an **idempotent upsert keyed by the client's
 * localUuid**: re-POSTing the same bill (network retry / offline replay) never
 * double-creates an order or double-deducts stock. Stock is deducted for
 * inventory vendors (grocery/general-retail) using the same oversell-safe
 * `lockAndDeduct` path as online orders. Tax + invoice come from `tax.service`.
 */

const TENDER_METHODS = ['CASH', 'CARD', 'UPI', 'WALLET', 'CREDIT', 'CHEQUE', 'RAZORPAY'];

/** Resolve the caller's store and assert ownership. */
async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

function genOrderNumber() {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `POS-${ds}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * Idempotently create (or return) a POS bill from a client payload.
 *
 * @param {string} userId  the authenticated vendor
 * @param {object} data
 *   { storeId, localUuid, orderType?, customer?{name,phone,gstin}, notes?,
 *     items:[{productId, variantId?, quantity, unitPrice, hsnSac?, isTaxInclusive?, lineDiscount?}],
 *     tenders:[{method, amount, referenceNumber?}], billDiscount?, localInvoiceNumber? }
 * @returns {Promise<{order, invoice, alreadyExisted:boolean}>}
 */
async function syncBill(userId, data) {
  const { storeId, localUuid, items, tenders = [], orderType = 'COUNTER' } = data;
  if (!storeId || !localUuid) throw new BadRequestError('storeId and localUuid are required');
  if (!Array.isArray(items) || items.length === 0) throw new BadRequestError('items[] is required');

  // Idempotency: a bill with this localUuid already synced → return it.
  const existing = await prisma.order.findUnique({ where: { localUuid } });
  if (existing) {
    const invoice = await prisma.invoice.findUnique({ where: { orderId: existing.id } });
    return { order: existing, invoice, alreadyExisted: true };
  }

  const store = await requireOwnStore(userId, storeId);
  const deductStock = store.vendorType === 'GROCERY' || store.vendorType === 'GENERAL_RETAIL';

  for (const t of tenders) {
    if (!TENDER_METHODS.includes(t.method)) throw new BadRequestError(`Invalid tender method: ${t.method}`);
  }

  // Compute totals with the same tax engine used online (place of supply = store state for counter).
  const quote = await taxService.quoteOrder({
    store,
    placeOfSupplyStateCode: store.stateCode,
    lines: items.map((i) => ({
      qty: i.quantity,
      unitPrice: Number(i.unitPrice),
      hsnSac: i.hsnSac || null,
      isTaxInclusive: Boolean(i.isTaxInclusive),
      lineDiscount: i.lineDiscount || null,
    })),
    billDiscount: data.billDiscount || null,
  });

  const subtotal = quote.totals.taxableSubtotal;
  const total = quote.totals.grandTotal;
  const totalPaid = tenders.reduce((s, t) => s + Number(t.amount), 0);

  const orderNumber = genOrderNumber();

  const created = await prisma.$transaction(async (tx) => {
    if (deductStock) {
      for (const i of items) {
        await stockLedger.deductForSale(tx, {
          storeId, productId: i.productId, quantity: i.quantity,
          referenceId: localUuid, createdBy: userId,
        });
      }
    }

    const order = await tx.order.create({
      data: {
        orderNumber,
        localUuid,
        localInvoiceNumber: data.localInvoiceNumber || null,
        customerId: null,
        storeId,
        channel: 'POS',
        orderType,
        status: totalPaid >= total ? 'DELIVERED' : 'PLACED',
        subtotal,
        discount: quote.totals.billDiscount,
        total,
        taxableSubtotal: quote.totals.taxableSubtotal,
        totalCgst: quote.totals.totalCgst,
        totalSgst: quote.totals.totalSgst,
        totalIgst: quote.totals.totalIgst,
        roundOff: quote.totals.roundOff,
        totalPaid,
        balanceDue: Math.max(total - totalPaid, 0),
        paymentMethod: 'COD',
        paymentStatus: totalPaid >= total ? 'PAID' : 'PENDING',
        customerName: data.customer?.name || null,
        customerPhone: data.customer?.phone || null,
        customerGstin: data.customer?.gstin || null,
        notes: data.notes || null,
        items: {
          create: items.map((i, idx) => ({
            productId: i.productId,
            variantId: i.variantId || null,
            productName: i.productName || 'Item',
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            totalPrice: quote.lines[idx].lineTotal,
            taxRate: quote.lines[idx].taxRate,
            taxableValue: quote.lines[idx].taxableValue,
            cgst: quote.lines[idx].cgst,
            sgst: quote.lines[idx].sgst,
            igst: quote.lines[idx].igst,
            cessAmount: quote.lines[idx].cessAmount,
            lineTotal: quote.lines[idx].lineTotal,
            hsnSac: i.hsnSac || null,
            isTaxInclusive: Boolean(i.isTaxInclusive),
          })),
        },
        tenders: {
          create: tenders.map((t) => ({
            method: t.method,
            amount: Number(t.amount),
            referenceNumber: t.referenceNumber || null,
          })),
        },
      },
    });

    return order;
  });

  // Finalize the GST invoice (own transaction inside; allocates the FY number).
  const invoice = await taxService.finalizeInvoice(created.id);
  return { order: created, invoice, alreadyExisted: false };
}

/** Park a bill (HELD) or resume it (PLACED). */
async function setHold(userId, orderId, hold) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.store.ownerId !== userId) throw new ForbiddenError('Not your order');
  if (order.channel !== 'POS') throw new BadRequestError('Only POS bills can be held');
  return prisma.order.update({
    where: { id: orderId },
    data: { status: hold ? 'HELD' : 'PLACED' },
  });
}

/** List store bills (both channels), filterable. */
async function listBills(userId, { storeId, channel, status, page = 1, limit = 20 }) {
  const store = await requireOwnStore(userId, storeId);
  const where = { storeId: store.id };
  if (channel) where.channel = channel;
  if (status) where.status = status;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { placedAt: 'desc' },
      include: { items: true, tenders: true, invoice: { select: { invoiceNumber: true, docType: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  return { orders, pagination: { page: pageNum, limit: limitNum, total } };
}

/** Compute + persist a day-close (Z-report) for a store/business date. */
async function dayClose(userId, { storeId, businessDate, openingCash = 0, terminalId = null }) {
  const store = await requireOwnStore(userId, storeId);
  const date = businessDate ? new Date(businessDate) : new Date();
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: { storeId: store.id, channel: 'POS', placedAt: { gte: dayStart, lte: dayEnd }, status: { notIn: ['HELD', 'DRAFT', 'CANCELLED'] } },
    include: { tenders: true },
  });

  const held = await prisma.order.count({
    where: { storeId: store.id, channel: 'POS', placedAt: { gte: dayStart, lte: dayEnd }, status: { in: ['HELD', 'DRAFT'] } },
  });

  let totalSales = 0, cashSales = 0, cardSales = 0, upiSales = 0, otherSales = 0, totalTax = 0, totalDiscount = 0;
  for (const o of orders) {
    totalSales += Number(o.total);
    totalTax += Number(o.totalCgst) + Number(o.totalSgst) + Number(o.totalIgst);
    totalDiscount += Number(o.discount);
    for (const t of o.tenders) {
      const amt = Number(t.amount);
      if (t.method === 'CASH') cashSales += amt;
      else if (t.method === 'CARD') cardSales += amt;
      else if (t.method === 'UPI') upiSales += amt;
      else otherSales += amt;
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const record = await prisma.dayClose.create({
    data: {
      storeId: store.id, terminalId, businessDate: dayStart,
      openingCash, totalSales: round2(totalSales),
      cashSales: round2(cashSales), cardSales: round2(cardSales), upiSales: round2(upiSales), otherSales: round2(otherSales),
      totalTax: round2(totalTax), totalDiscount: round2(totalDiscount),
      billCount: orders.length, closedBy: userId,
    },
  });

  return { dayClose: record, heldUnsettled: held };
}

module.exports = { syncBill, setHold, listBills, dayClose };
