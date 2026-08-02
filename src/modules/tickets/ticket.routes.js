const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Customer support ticketing system
 */

/**
 * @swagger
 * /api/v1/tickets:
 *   post:
 *     summary: Create a support ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, subject, description]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [order, store, account, payment, delivery]
 *               subject:
 *                 type: string
 *                 example: "Order not delivered"
 *               description:
 *                 type: string
 *               orderId:
 *                 type: string
 *               storeId:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [P0, P1, P2, P3]
 *                 default: P3
 *     responses:
 *       201:
 *         description: Ticket created
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { category, subject, description, orderId, storeId, priority } = req.body;

  if (!category || !subject || !description) {
    throw new BadRequestError('category, subject, and description are required');
  }

  // Auto-assign priority based on category
  let assignedPriority = priority || 'P3';
  if (category === 'payment') assignedPriority = 'P0';
  else if (category === 'order') assignedPriority = 'P1';
  else if (category === 'delivery') assignedPriority = 'P1';

  // Generate ticket number
  const count = await prisma.ticket.count();
  const ticketNumber = `TKT-${String(count + 1).padStart(6, '0')}`;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      userId: req.user.id,
      orderId: orderId || null,
      storeId: storeId || null,
      category,
      subject,
      description,
      priority: assignedPriority,
      status: 'open',
    },
  });

  // Create initial message
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, senderId: req.user.id, message: description },
  });

  res.status(201).json({ ticket, message: 'Ticket created. Our team will respond shortly.' });
}));

/**
 * @swagger
 * /api/v1/tickets:
 *   get:
 *     summary: List tickets (user sees own, support/admin sees all)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, closed, escalated]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [P0, P1, P2, P3]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket list
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, priority, page = 1 } = req.query;
  const pageNum = parseInt(page);
  const where = { userId: req.user.id };

  // Support/Admin sees all tickets (check if user has role)
  const userRoles = await prisma.userRole.findMany({
    where: { userId: req.user.id },
    include: { role: { select: { name: true } } },
  });
  const roleNames = userRoles.map(ur => ur.role.name);
  if (roleNames.some(r => ['Super Admin', 'Admin', 'Manager', 'Support Agent'].includes(r))) {
    delete where.userId;
    // Support sees assigned tickets
    if (roleNames.includes('Support Agent') && !roleNames.includes('Admin')) {
      where.OR = [{ assignedTo: req.user.id }, { assignedTo: null }];
    }
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where, skip: (pageNum - 1) * 20, take: 20,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  res.json({ tickets, pagination: { page: pageNum, total } });
}));

/**
 * @swagger
 * /api/v1/tickets/{id}:
 *   get:
 *     summary: Get ticket details with messages
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket with message thread
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, phone: true } },
      assignee: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  res.json({ ticket });
}));

/**
 * @swagger
 * /api/v1/tickets/{id}/reply:
 *   post:
 *     summary: Add a reply to a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *                 default: false
 *                 description: Internal note (only visible to support team)
 *     responses:
 *       201:
 *         description: Reply added
 */
router.post('/:id/reply', authenticate, asyncHandler(async (req, res) => {
  const { message, isInternal } = req.body;
  if (!message) throw new BadRequestError('Message is required');

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  const reply = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderId: req.user.id,
      message,
      isInternal: isInternal || false,
    },
  });

  // Auto-update status to in_progress if support replies
  if (ticket.status === 'open' && ticket.userId !== req.user.id) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'in_progress' } });
  }

  res.status(201).json({ reply });
}));

/**
 * @swagger
 * /api/v1/tickets/{id}/assign:
 *   patch:
 *     summary: Assign ticket to support agent (admin/manager)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignedTo]
 *             properties:
 *               assignedTo:
 *                 type: string
 *                 description: User ID of support agent
 *     responses:
 *       200:
 *         description: Ticket assigned
 */
router.patch('/:id/assign', authenticate, asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;
  if (!assignedTo) throw new BadRequestError('assignedTo user ID required');

  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { assignedTo, status: 'in_progress' },
  });

  res.json({ ticket, message: 'Ticket assigned' });
}));

/**
 * @swagger
 * /api/v1/tickets/{id}/resolve:
 *   patch:
 *     summary: Mark ticket as resolved
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resolution:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket resolved
 */
router.patch('/:id/resolve', authenticate, asyncHandler(async (req, res) => {
  const { resolution } = req.body;

  const ticket = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { status: 'resolved', resolvedAt: new Date() },
  });

  if (resolution) {
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, senderId: req.user.id, message: `Resolved: ${resolution}` },
    });
  }

  res.json({ ticket, message: 'Ticket resolved' });
}));

/**
 * @swagger
 * /api/v1/tickets/{id}/escalate:
 *   patch:
 *     summary: Escalate ticket to higher level
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket escalated
 */
router.patch('/:id/escalate', authenticate, asyncHandler(async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) throw new NotFoundError('Ticket not found');

  // Escalate priority
  const escalationMap = { P3: 'P2', P2: 'P1', P1: 'P0', P0: 'P0' };
  const newPriority = escalationMap[ticket.priority] || 'P1';

  const updated = await prisma.ticket.update({
    where: { id: req.params.id },
    data: { status: 'escalated', priority: newPriority },
  });

  res.json({ ticket: updated, message: `Ticket escalated to ${newPriority}` });
}));

module.exports = router;
