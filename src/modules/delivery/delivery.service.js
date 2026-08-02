/**
 * Delivery service - agent assignment, tracking, payouts (Phase 4)
 * Public interface: deliveryService.assignAgent(orderId)
 */

const getAvailableOrders = async (agentId, { lat, lng }) => {
  // TODO: Find orders marked 'ready' within agent's service radius
  return [];
};

const acceptOrder = async (agentId, orderId) => {
  // TODO: Assign agent to order, update order status
  // TODO: Emit 'order:picked' via WebSocket
  return { message: 'Order accepted for delivery', orderId, agentId };
};

const updateLocation = async (agentId, orderId, { lat, lng }) => {
  // TODO: Store location in Redis (real-time, high-frequency updates)
  // TODO: Emit 'order:location' via WebSocket to customer
  return true;
};

/**
 * Find and assign nearest available delivery agent
 */
const assignAgent = async (orderId, storeLocation) => {
  // TODO: Find agents within radius → nearest first → send notification
  // TODO: 2-min timeout → try next agent
  return null;
};

module.exports = { getAvailableOrders, acceptOrder, updateLocation, assignAgent };
