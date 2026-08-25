const {
  validateTransition,
  canCancel,
  getRefundPercentage,
} = require('../../src/modules/orders/order.workflow');
const { ORDER_STATUS } = require('../../src/shared/utils/constants');

/**
 * Pure, DB-free unit tests for the order state machine (PRD §7).
 * These run without Postgres — they exercise the transition table and the
 * cancellation/refund policy directly.
 */
describe('order.workflow', () => {
  describe('validateTransition', () => {
    it('allows the full happy path PLACED → … → DELIVERED → REFUNDED', () => {
      const path = [
        [ORDER_STATUS.PLACED, ORDER_STATUS.ACCEPTED],
        [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING],
        [ORDER_STATUS.PREPARING, ORDER_STATUS.READY],
        [ORDER_STATUS.READY, ORDER_STATUS.PICKED],
        [ORDER_STATUS.PICKED, ORDER_STATUS.DELIVERED],
        [ORDER_STATUS.DELIVERED, ORDER_STATUS.REFUNDED],
      ];
      for (const [from, to] of path) {
        expect(validateTransition(from, to)).toBe(true);
      }
    });

    it('allows cancellation from PLACED/ACCEPTED/PREPARING', () => {
      expect(validateTransition(ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED)).toBe(true);
      expect(validateTransition(ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED)).toBe(true);
      expect(validateTransition(ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED)).toBe(true);
    });

    it('rejects skipping a stage (PLACED → PREPARING)', () => {
      expect(() => validateTransition(ORDER_STATUS.PLACED, ORDER_STATUS.PREPARING)).toThrow(
        /Cannot transition/
      );
    });

    it('rejects moving backwards (READY → PREPARING)', () => {
      expect(() => validateTransition(ORDER_STATUS.READY, ORDER_STATUS.PREPARING)).toThrow(
        /Cannot transition/
      );
    });

    it('rejects cancelling once READY (past the cancellation window)', () => {
      expect(() => validateTransition(ORDER_STATUS.READY, ORDER_STATUS.CANCELLED)).toThrow(
        /Cannot transition/
      );
    });

    it('rejects any transition out of a terminal state', () => {
      expect(() => validateTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.ACCEPTED)).toThrow(
        /Cannot transition/
      );
      expect(() => validateTransition(ORDER_STATUS.REFUNDED, ORDER_STATUS.DELIVERED)).toThrow(
        /Cannot transition/
      );
    });
  });

  describe('canCancel', () => {
    it('permits cancellation while PLACED/ACCEPTED/PREPARING', () => {
      expect(canCancel(ORDER_STATUS.PLACED)).toBe(true);
      expect(canCancel(ORDER_STATUS.ACCEPTED)).toBe(true);
      expect(canCancel(ORDER_STATUS.PREPARING)).toBe(true);
    });

    it('forbids cancellation once READY or later', () => {
      expect(canCancel(ORDER_STATUS.READY)).toBe(false);
      expect(canCancel(ORDER_STATUS.PICKED)).toBe(false);
      expect(canCancel(ORDER_STATUS.DELIVERED)).toBe(false);
    });
  });

  describe('getRefundPercentage', () => {
    it('is 100% before the store starts preparing', () => {
      expect(getRefundPercentage(ORDER_STATUS.PLACED)).toBe(100);
      expect(getRefundPercentage(ORDER_STATUS.ACCEPTED)).toBe(100);
    });

    it('is 50% while preparing', () => {
      expect(getRefundPercentage(ORDER_STATUS.PREPARING)).toBe(50);
    });

    it('is 0% once ready or beyond', () => {
      expect(getRefundPercentage(ORDER_STATUS.READY)).toBe(0);
      expect(getRefundPercentage(ORDER_STATUS.PICKED)).toBe(0);
      expect(getRefundPercentage(ORDER_STATUS.DELIVERED)).toBe(0);
    });
  });
});
