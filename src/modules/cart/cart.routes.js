const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Multi-store shopping cart (separate cart per store)
 */

/**
 * @swagger
 * /api/v1/cart:
 *   get:
 *     summary: Get all carts for current user (grouped by store)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All carts with items
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const carts = await prisma.cart.findMany({
    where: { userId: req.user.id },
    include: {
      store: { select: { id: true, name: true, slug: true, logoUrl: true, isOpen: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, images: true, mrp: true, sellingPrice: true, isAvailable: true, stockQuantity: true } },
          variant: { select: { id: true, variantName: true, priceOverride: true, isAvailable: true } },
        },
      },
    },
  });

  // Calculate totals per cart
  const cartsWithTotals = carts.map(cart => {
    let subtotal = 0;
    const items = cart.items.map(item => {
      const price = item.variant?.priceOverride ? parseFloat(item.variant.priceOverride) : parseFloat(item.product.sellingPrice);
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;
      return { ...item, unitPrice: price, itemTotal };
    });
    return { ...cart, items, subtotal, itemCount: items.length };
  });

  res.json({ carts: cartsWithTotals });
}));

/**
 * @swagger
 * /api/v1/cart/add:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, productId, quantity]
 *             properties:
 *               storeId:
 *                 type: string
 *               productId:
 *                 type: string
 *               variantId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Item added to cart
 */
router.post('/add', authenticate, asyncHandler(async (req, res) => {
  const { storeId, productId, variantId, quantity } = req.body;

  if (!storeId || !productId || !quantity || quantity < 1) {
    throw new BadRequestError('storeId, productId, and quantity (>=1) required');
  }

  // Verify product exists and is available
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== 'ACTIVE' || !product.isAvailable) {
    throw new BadRequestError('Product not available');
  }
  if (product.stockQuantity < quantity) {
    throw new BadRequestError(`Only ${product.stockQuantity} items in stock`);
  }

  // Get or create cart for this store
  const cart = await prisma.cart.upsert({
    where: { userId_storeId: { userId: req.user.id, storeId } },
    create: { userId: req.user.id, storeId },
    update: {},
  });

  // Upsert cart item
  const existingItem = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, variantId: variantId || null },
  });

  let item;
  if (existingItem) {
    item = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity },
    });
  } else {
    item = await prisma.cartItem.create({
      data: { cartId: cart.id, productId, variantId: variantId || null, quantity },
    });
  }

  res.json({ item, message: 'Item added to cart' });
}));

/**
 * @swagger
 * /api/v1/cart/update:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cartItemId, quantity]
 *             properties:
 *               cartItemId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Cart item updated
 */
router.put('/update', authenticate, asyncHandler(async (req, res) => {
  const { cartItemId, quantity } = req.body;
  if (!cartItemId || !quantity) throw new BadRequestError('cartItemId and quantity required');

  const cartItem = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: true, product: true },
  });
  if (!cartItem || cartItem.cart.userId !== req.user.id) throw new NotFoundError('Cart item not found');

  if (cartItem.product.stockQuantity < quantity) {
    throw new BadRequestError(`Only ${cartItem.product.stockQuantity} in stock`);
  }

  const updated = await prisma.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
  res.json({ item: updated, message: 'Quantity updated' });
}));

/**
 * @swagger
 * /api/v1/cart/remove:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cartItemId]
 *             properties:
 *               cartItemId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item removed
 */
router.delete('/remove', authenticate, asyncHandler(async (req, res) => {
  const { cartItemId } = req.body;
  const cartItem = await prisma.cartItem.findUnique({ where: { id: cartItemId }, include: { cart: true } });
  if (!cartItem || cartItem.cart.userId !== req.user.id) throw new NotFoundError('Cart item not found');

  await prisma.cartItem.delete({ where: { id: cartItemId } });

  // Delete cart if empty
  const remaining = await prisma.cartItem.count({ where: { cartId: cartItem.cartId } });
  if (remaining === 0) {
    await prisma.cart.delete({ where: { id: cartItem.cartId } });
  }

  res.json({ message: 'Item removed from cart' });
}));

/**
 * @swagger
 * /api/v1/cart/clear/{storeId}:
 *   delete:
 *     summary: Clear entire cart for a store
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete('/clear/:storeId', authenticate, asyncHandler(async (req, res) => {
  const cart = await prisma.cart.findUnique({
    where: { userId_storeId: { userId: req.user.id, storeId: req.params.storeId } },
  });
  if (cart) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.delete({ where: { id: cart.id } });
  }
  res.json({ message: 'Cart cleared' });
}));

module.exports = router;
