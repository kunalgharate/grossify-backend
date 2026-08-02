const { Server } = require('socket.io');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} httpServer - The HTTP server instance
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Client joins their user room
    socket.on('join', ({ userId, role, storeId }) => {
      if (userId) socket.join(`user:${userId}`);
      if (role === 'vendor' && storeId) socket.join(`store:${storeId}`);
      if (role === 'delivery') socket.join('delivery:pool');
      console.log(`[Socket] ${socket.id} joined rooms - user:${userId}, store:${storeId || 'none'}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  console.log('⚡ Socket.IO initialized');
  return io;
};

/**
 * Get the Socket.IO instance
 */
const getIO = () => io;

// ─── Emit helpers (called from services) ──────────────────

/**
 * Notify vendor of a new order
 */
const emitNewOrder = (storeId, order) => {
  if (!io) return;
  io.to(`store:${storeId}`).emit('order:new', { order });
};

/**
 * Notify customer of order status change
 */
const emitOrderStatus = (customerId, orderId, status) => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('order:status', { orderId, status });
};

/**
 * Notify customer that order is accepted
 */
const emitOrderAccepted = (customerId, orderId) => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('order:accepted', { orderId });
};

/**
 * Notify customer that order is ready
 */
const emitOrderReady = (customerId, orderId) => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('order:ready', { orderId });
};

/**
 * Notify delivery agents of available order
 */
const emitDeliveryAvailable = (order) => {
  if (!io) return;
  io.to('delivery:pool').emit('delivery:available', { order });
};

/**
 * Send live location update to customer
 */
const emitDeliveryLocation = (customerId, orderId, location) => {
  if (!io) return;
  io.to(`user:${customerId}`).emit('order:location', { orderId, ...location });
};

/**
 * Notify customer of stock change (item in cart went OOS)
 */
const emitStockUpdate = (productId, isAvailable) => {
  if (!io) return;
  io.emit('stock:updated', { productId, isAvailable });
};

module.exports = {
  initSocket,
  getIO,
  emitNewOrder,
  emitOrderStatus,
  emitOrderAccepted,
  emitOrderReady,
  emitDeliveryAvailable,
  emitDeliveryLocation,
  emitStockUpdate,
};
