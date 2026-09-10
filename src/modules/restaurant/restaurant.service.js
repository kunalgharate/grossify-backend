const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Restaurant service (Phase B3): menu items (Product type=MENU_ITEM),
 * modifier groups/modifiers, dine-in tables, and KOT firing.
 *
 * KOT firing groups an order's items by their prep station and creates one KOT
 * per station, each with its own sequence number that is INDEPENDENT of the
 * invoice number (a KOT is operational, not financial — no prices).
 */

async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

// ── Menu items ────────────────────────────────────────────
async function createMenuItem(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  if (!data.name || data.sellingPrice == null) {
    throw new BadRequestError('name and sellingPrice are required');
  }
  const slug = `${data.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
  return prisma.product.create({
    data: {
      storeId, name: data.name, slug, categoryId: data.categoryId,
      mrp: data.sellingPrice, sellingPrice: data.sellingPrice,
      type: 'MENU_ITEM', prepStation: data.prepStation || 'KITCHEN',
      foodType: data.foodType || null, hsn: data.hsnSac || '9963',
      taxRate: data.taxRate ?? 5, trackInventory: false, unit: 'plate',
    },
  });
}

async function listMenu(userId, storeId) {
  await requireOwnStore(userId, storeId);
  return prisma.product.findMany({
    where: { storeId, type: 'MENU_ITEM', status: 'ACTIVE' },
    include: { modifierGroups: { include: { modifiers: true } } },
    orderBy: { name: 'asc' },
  });
}

// ── Modifiers ─────────────────────────────────────────────
async function createModifierGroup(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  if (!data.name) throw new BadRequestError('Modifier group name is required');
  return prisma.modifierGroup.create({
    data: {
      storeId, productId: data.productId || null, name: data.name,
      minSelect: data.minSelect ?? 0, maxSelect: data.maxSelect ?? 1,
      required: data.required ?? false,
      modifiers: {
        create: (data.modifiers || []).map((m, i) => ({
          name: m.name, priceDelta: m.priceDelta ?? 0, isDefault: m.isDefault ?? false, sortOrder: i,
        })),
      },
    },
    include: { modifiers: true },
  });
}

// ── Tables ────────────────────────────────────────────────
async function createTable(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  if (!data.name) throw new BadRequestError('Table name is required');
  return prisma.restaurantTable.create({
    data: { storeId, name: data.name, section: data.section || null, capacity: data.capacity ?? 4 },
  });
}

async function listTables(userId, storeId) {
  await requireOwnStore(userId, storeId);
  return prisma.restaurantTable.findMany({ where: { storeId }, orderBy: { name: 'asc' } });
}

async function setTableStatus(userId, storeId, tableId, status, currentOrderId = null) {
  await requireOwnStore(userId, storeId);
  const valid = ['free', 'occupied', 'reserved', 'billed'];
  if (!valid.includes(status)) throw new BadRequestError(`status must be one of ${valid.join(', ')}`);
  return prisma.restaurantTable.update({
    where: { id: tableId },
    data: { status, currentOrderId: status === 'free' ? null : currentOrderId },
  });
}

// ── KOT firing ────────────────────────────────────────────
function kotSeq() {
  const d = new Date();
  return `K${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

/**
 * Fire KOTs for an order: group items by prep station, create one KOT per
 * station (independent numbering). Items carry modifiers + notes but NO prices.
 *
 * @param {object} data { orderId, items:[{menuItemId, name, qty, station?, modifiers?[], notes?}] }
 * @returns {Promise<Array>} the created KOTs (with items), one per station
 */
async function fireKot(userId, storeId, data) {
  await requireOwnStore(userId, storeId);
  const { orderId, items } = data;
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    throw new BadRequestError('orderId and items[] are required');
  }

  // Group by station (fallback to each item's product prepStation, else KITCHEN).
  const byStation = new Map();
  for (const it of items) {
    let station = it.station;
    if (!station) {
      const prod = await prisma.product.findUnique({ where: { id: it.menuItemId }, select: { prepStation: true } });
      station = prod?.prepStation || 'KITCHEN';
    }
    if (!byStation.has(station)) byStation.set(station, []);
    byStation.get(station).push(it);
  }

  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const [station, stationItems] of byStation.entries()) {
      const kot = await tx.kOT.create({
        data: {
          storeId, orderId, kotNumber: kotSeq(), station, status: 'new',
          items: {
            create: stationItems.map((it) => ({
              menuItemId: it.menuItemId, name: it.name, qty: it.qty,
              modifiers: it.modifiers || [], notes: it.notes || null,
            })),
          },
        },
        include: { items: true },
      });
      created.push(kot);
    }
  });
  return created;
}

async function updateKotStatus(userId, storeId, kotId, status) {
  await requireOwnStore(userId, storeId);
  const valid = ['new', 'preparing', 'ready', 'served', 'cancelled'];
  if (!valid.includes(status)) throw new BadRequestError(`status must be one of ${valid.join(', ')}`);
  const data = { status };
  if (status === 'served' || status === 'ready') data.printedAt = data.printedAt;
  return prisma.kOT.update({ where: { id: kotId }, data: { status } });
}

async function listKots(userId, storeId, { status } = {}) {
  await requireOwnStore(userId, storeId);
  const where = { storeId };
  if (status) where.status = status;
  return prisma.kOT.findMany({ where, orderBy: { createdAt: 'desc' }, include: { items: true } });
}

module.exports = {
  createMenuItem, listMenu,
  createModifierGroup,
  createTable, listTables, setTableStatus,
  fireKot, updateKotStatus, listKots,
};
