const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const inventoryService = require('../inventory/inventory.service');

/**
 * Purchases service (Phase B2): suppliers, purchase orders, and goods receipts.
 * Receiving a GRN posts PURCHASE_IN stock movements through the ledger and
 * (for batch-tracked products) creates StockBatch rows for FEFO picking.
 */

async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

function seq(prefix) {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ds}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

async function validateSupplierAndProducts(db, storeId, supplierId, items) {
  if (items.some((item) => !item || typeof item !== 'object')) {
    throw new BadRequestError('Each item must be an object');
  }
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, storeId, isActive: true },
    select: { id: true },
  });
  if (!supplier) throw new NotFoundError('Supplier not found');

  const productIds = items.map((item) => item.productId);
  if (productIds.some((id) => !id) || new Set(productIds).size !== productIds.length) {
    throw new BadRequestError('Each item must have a unique productId');
  }

  const products = await db.product.findMany({
    where: { id: { in: productIds }, storeId },
    select: { id: true },
  });
  if (products.length !== productIds.length) throw new NotFoundError('Product not found');
}

function validatePositiveInteger(value, field) {
  if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
    throw new BadRequestError(`${field} must be a positive integer`);
  }
}

function validateMoney(value, field) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new BadRequestError(`${field} must be a non-negative number`);
  }
}

// ── Suppliers ─────────────────────────────────────────────
async function createSupplier(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  if (!data.name) throw new BadRequestError('Supplier name is required');
  return prisma.supplier.create({
    data: {
      storeId, name: data.name, gstin: data.gstin || null, phone: data.phone || null,
      email: data.email || null, address: data.address || null, stateCode: data.stateCode ?? null,
    },
  });
}

async function listSuppliers(userId, storeId) {
  await requireOwnStore(userId, storeId);
  return prisma.supplier.findMany({ where: { storeId, isActive: true }, orderBy: { name: 'asc' } });
}

// ── Purchase Orders ───────────────────────────────────────
async function createPurchaseOrder(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  const { supplierId, items, expectedDate, notes } = data;
  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    throw new BadRequestError('supplierId and items[] are required');
  }
  await validateSupplierAndProducts(prisma, storeId, supplierId, items);
  let subtotal = 0, taxAmount = 0;
  for (const it of items) {
    validatePositiveInteger(it.quantity, 'quantity');
    validateMoney(it.costPrice, 'costPrice');
    if (it.taxRate != null && (!Number.isFinite(Number(it.taxRate)) ||
        Number(it.taxRate) < 0 || Number(it.taxRate) > 100)) {
      throw new BadRequestError('taxRate must be between 0 and 100');
    }
    const line = Number(it.costPrice) * Number(it.quantity);
    subtotal += line;
    taxAmount += line * (Number(it.taxRate) || 0) / 100;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return prisma.purchaseOrder.create({
    data: {
      storeId, supplierId, poNumber: seq('PO'), status: 'draft',
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      subtotal: round2(subtotal), taxAmount: round2(taxAmount), total: round2(subtotal + taxAmount),
      notes: notes || null, createdBy: userId,
      items: {
        create: items.map((it) => ({
          productId: it.productId, quantity: it.quantity,
          costPrice: it.costPrice, taxRate: it.taxRate || 0,
        })),
      },
    },
    include: { items: true, supplier: { select: { name: true } } },
  });
}

async function listPurchaseOrders(userId, storeId, { status } = {}) {
  await requireOwnStore(userId, storeId);
  const where = { storeId };
  if (status) where.status = status;
  return prisma.purchaseOrder.findMany({
    where, orderBy: { createdAt: 'desc' },
    include: { supplier: { select: { name: true } }, items: true },
  });
}

// ── Goods Receipt (receiving) ─────────────────────────────
/**
 * Receive stock against a supplier (optionally a PO). Posts PURCHASE_IN to the
 * ledger for each line, creates StockBatch rows for batch-tracked products,
 * updates the linked PO's received quantities + status, and bumps supplier
 * payable. All atomic.
 *
 * @param {object} data { supplierId, purchaseOrderId?, items:[{productId, qtyReceived,
 *                        costPrice, mrp?, batchNumber?, expiryDate?, mfgDate?}], notes? }
 */
async function receiveGoods(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  const { supplierId, purchaseOrderId, items, notes } = data;
  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    throw new BadRequestError('supplierId and items[] are required');
  }

  return prisma.$transaction(async (tx) => {
    await validateSupplierAndProducts(tx, storeId, supplierId, items);
    for (const it of items) {
      validatePositiveInteger(it.qtyReceived, 'qtyReceived');
      validateMoney(it.costPrice, 'costPrice');
      if (it.mrp != null) validateMoney(it.mrp, 'mrp');
    }

    let po;
    if (purchaseOrderId) {
      po = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId }, include: { items: true },
      });
      if (!po || po.storeId !== storeId || po.supplierId !== supplierId) {
        throw new NotFoundError('Purchase order not found');
      }
      if (po.status === 'cancelled' || po.status === 'received') {
        throw new BadRequestError('Purchase order cannot receive additional goods');
      }
      for (const it of items) {
        const poItem = po.items.find((line) => line.productId === it.productId);
        if (!poItem) throw new BadRequestError('Received product is not on the purchase order');
        if (poItem.qtyReceived + Number(it.qtyReceived) > poItem.quantity) {
          throw new BadRequestError('Received quantity exceeds the purchase order balance');
        }
      }
    }

    const grn = await tx.goodsReceipt.create({
      data: {
        storeId, supplierId, purchaseOrderId: purchaseOrderId || null,
        grnNumber: seq('GRN'), receivedBy: userId, notes: notes || null,
        items: {
          create: items.map((it) => ({
            productId: it.productId, qtyReceived: it.qtyReceived,
            costPrice: it.costPrice, mrp: it.mrp ?? null,
            batchNumber: it.batchNumber || null,
            expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
            mfgDate: it.mfgDate ? new Date(it.mfgDate) : null,
          })),
        },
      },
      include: { items: true },
    });

    let payableInc = 0;
    for (const it of items) {
      const product = await tx.product.findUnique({
        where: { id: it.productId }, select: { trackBatch: true },
      });
      let batchId = null;
      if (product?.trackBatch) {
        const batch = await tx.stockBatch.create({
          data: {
            storeId, productId: it.productId,
            batchNumber: it.batchNumber || `AUTO-${Date.now()}`,
            expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
            mfgDate: it.mfgDate ? new Date(it.mfgDate) : null,
            costPrice: it.costPrice, mrp: it.mrp ?? null, qtyRemaining: 0,
          },
        });
        batchId = batch.id;
      }
      await inventoryService.postTxn(tx, {
        storeId, productId: it.productId, type: 'PURCHASE_IN', quantity: it.qtyReceived,
        unitCost: it.costPrice, batchId, referenceType: 'GRN', referenceId: grn.id, createdBy: userId,
      });
      // Keep product costPrice fresh (last purchase cost).
      await tx.product.update({ where: { id: it.productId }, data: { costPrice: it.costPrice } });
      payableInc += Number(it.costPrice) * Number(it.qtyReceived);
    }

    // Update PO received quantities + status.
    if (po) {
      for (const it of items) {
        const poItem = po.items.find((p) => p.productId === it.productId);
        await tx.pOItem.update({
          where: { id: poItem.id },
          data: { qtyReceived: { increment: it.qtyReceived } },
        });
      }
      const refreshed = await tx.pOItem.findMany({ where: { purchaseOrderId } });
      const fullyReceived = refreshed.every((p) => p.qtyReceived >= p.quantity);
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: fullyReceived ? 'received' : 'partially_received' },
      });
    }

    await tx.supplier.update({
      where: { id: supplierId },
      data: { outstandingPayable: { increment: Math.round(payableInc * 100) / 100 } },
    });

    return grn;
  });
}

module.exports = {
  createSupplier, listSuppliers,
  createPurchaseOrder, listPurchaseOrders,
  receiveGoods,
};
