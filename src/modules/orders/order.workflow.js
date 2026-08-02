const { BadRequestError } = require('../../shared/errors');
const { ORDER_STATUS } = require('../../shared/utils/constants');

/**
 * Order workflow - defines valid status transitions
 * placed → accepted → preparing → ready → picked → delivered
 *                                                  ↘ cancelled (at certain stages)
 */

const VALID_TRANSITIONS = {
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY]: [ORDER_STATUS.PICKED],
  [ORDER_STATUS.PICKED]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.REFUNDED],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REFUNDED]: [],
};

/**
 * Validates if a status transition is allowed
 */
const validateTransition = (currentStatus, newStatus) => {
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed || !allowed.includes(newStatus)) {
    throw new BadRequestError(
      `Cannot transition from '${currentStatus}' to '${newStatus}'`
    );
  }

  return true;
};

/**
 * Checks if order can be cancelled based on current status (PRD Section 7.6)
 */
const canCancel = (currentStatus) => {
  const cancellableStatuses = [
    ORDER_STATUS.PLACED,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.PREPARING, // partial refund
  ];

  return cancellableStatuses.includes(currentStatus);
};

/**
 * Calculate refund percentage based on cancellation stage
 */
const getRefundPercentage = (currentStatus) => {
  switch (currentStatus) {
    case ORDER_STATUS.PLACED:
    case ORDER_STATUS.ACCEPTED:
      return 100; // Full refund
    case ORDER_STATUS.PREPARING:
      return 50; // Partial refund
    default:
      return 0; // No refund
  }
};

module.exports = { validateTransition, canCancel, getRefundPercentage };
