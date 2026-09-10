const express = require('express');
const net = require('net');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Printers
 *   description: Thermal printer configuration + network print bridge (Billing B1)
 */

const ROLES = ['BILL', 'KOT', 'LABEL', 'REPORT'];
const WIDTHS = ['MM_58', 'MM_80', 'MM_76', 'MM_112'];
const CONNS = ['BT_CLASSIC', 'BLE', 'USB', 'NETWORK'];
const DEFAULT_CPL = { MM_58: 32, MM_76: 42, MM_80: 48, MM_112: 69 };

async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

/** List a store's printer configs. */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { storeId } = req.query;
  await requireOwnStore(req.user.id, storeId);
  const printers = await prisma.printerConfig.findMany({ where: { storeId }, orderBy: { role: 'asc' } });
  res.json({ printers });
}));

/** Create a printer config. */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { storeId, label, role = 'BILL', paperWidth = 'MM_80', charsPerLine, connectionType, deviceAddress, features, copies = 1, isDefault = false, station } = req.body || {};
  await requireOwnStore(req.user.id, storeId);
  if (!label || !deviceAddress) throw new BadRequestError('label and deviceAddress are required');
  if (!ROLES.includes(role)) throw new BadRequestError(`role must be one of ${ROLES.join(', ')}`);
  if (!WIDTHS.includes(paperWidth)) throw new BadRequestError(`paperWidth must be one of ${WIDTHS.join(', ')}`);
  if (!CONNS.includes(connectionType)) throw new BadRequestError(`connectionType must be one of ${CONNS.join(', ')}`);

  const printer = await prisma.printerConfig.create({
    data: {
      storeId, label, role, paperWidth,
      charsPerLine: charsPerLine || DEFAULT_CPL[paperWidth] || 48,
      connectionType, deviceAddress, features: features || undefined, copies, isDefault, station: station || null,
    },
  });
  res.status(201).json({ printer });
}));

/** Update a printer config. */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const existing = await prisma.printerConfig.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!existing) throw new NotFoundError('Printer not found');
  if (existing.store.ownerId !== req.user.id) throw new ForbiddenError('Not your printer');

  const allowed = ['label', 'role', 'paperWidth', 'charsPerLine', 'connectionType', 'deviceAddress', 'features', 'copies', 'isDefault', 'station'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  if (data.role && !ROLES.includes(data.role)) throw new BadRequestError('invalid role');
  if (data.paperWidth && !WIDTHS.includes(data.paperWidth)) throw new BadRequestError('invalid paperWidth');
  if (data.connectionType && !CONNS.includes(data.connectionType)) throw new BadRequestError('invalid connectionType');

  const printer = await prisma.printerConfig.update({ where: { id: req.params.id }, data });
  res.json({ printer });
}));

/** Delete a printer config. */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const existing = await prisma.printerConfig.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!existing) throw new NotFoundError('Printer not found');
  if (existing.store.ownerId !== req.user.id) throw new ForbiddenError('Not your printer');
  await prisma.printerConfig.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

/**
 * Network print-bridge: relay a base64 ESC/POS payload to a TCP 9100 printer.
 * Used by the web panel (browsers cannot open raw TCP). Payload is never stored.
 */
router.post('/bridge', authenticate, asyncHandler(async (req, res) => {
  const { ip, port = 9100, payloadBase64 } = req.body || {};
  if (!ip || !payloadBase64) throw new BadRequestError('ip and payloadBase64 are required');
  const buf = Buffer.from(payloadBase64, 'base64');

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const done = (err) => { socket.destroy(); err ? reject(err) : resolve(); };
    socket.setTimeout(5000);
    socket.on('timeout', () => done(new BadRequestError('PRINTER_TIMEOUT: no response from printer')));
    socket.on('error', (e) => done(new BadRequestError(`PRINTER_UNREACHABLE: ${e.message}`)));
    socket.connect(Number(port), ip, () => socket.write(buf, () => done()));
  });

  res.json({ ok: true, bytes: buf.length });
}));

module.exports = router;
