/**
 * Application-wide constants
 */

const ORDER_STATUS = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  PICKED: 'PICKED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
};

const USER_ROLES = {
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  ADMIN: 'admin',
  MANAGER: 'manager',
  SUPPORT: 'support',
  DELIVERY: 'delivery',
};

const STORE_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
};

const SUBSCRIPTION_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  GRACE: 'grace',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const PAYMENT_METHOD = {
  ONLINE: 'online',
  COD: 'cod',
  WALLET: 'wallet',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

module.exports = {
  ORDER_STATUS,
  USER_ROLES,
  STORE_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
};
