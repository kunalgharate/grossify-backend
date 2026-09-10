// DB-free: stub the shared Prisma singleton so requiring the service never
// instantiates a real client. The functions under test either take a fake `tx`
// (allocateInvoiceNumber) or are pure (financialYearOf, assertSaleAllowed).
jest.mock('../../src/shared/database', () => ({ prisma: {} }));

const taxService = require('../../src/modules/tax/tax.service');

describe('tax.service', () => {
  describe('financialYearOf (India FY: Apr–Mar)', () => {
    it('maps Feb 2026 to 2025-26', () => {
      expect(taxService.financialYearOf(new Date('2026-02-10'))).toBe('2025-26');
    });
    it('maps Apr 2026 to 2026-27', () => {
      expect(taxService.financialYearOf(new Date('2026-04-01'))).toBe('2026-27');
    });
    it('maps Mar 31 2027 to 2026-27 (last day of FY)', () => {
      expect(taxService.financialYearOf(new Date('2027-03-31'))).toBe('2026-27');
    });
  });

  describe('assertSaleAllowed (GSTIN / scheme gate)', () => {
    const store = (o = {}) => ({ stateCode: 27, gstNumber: null, gstScheme: 'UNREGISTERED', ...o });

    it('allows intra-state without GSTIN as UNREGISTERED', () => {
      const r = taxService.assertSaleAllowed(store(), 27);
      expect(r.isInterState).toBe(false);
      expect(r.gstScheme).toBe('UNREGISTERED');
    });

    it('blocks inter-state supply without a GSTIN', () => {
      expect(() => taxService.assertSaleAllowed(store(), 24)).toThrow(/GSTIN_REQUIRED/);
    });

    it('allows inter-state supply with a GSTIN (REGULAR)', () => {
      const r = taxService.assertSaleAllowed(store({ gstNumber: '27ABCDE1234F1Z5', gstScheme: 'REGULAR' }), 24);
      expect(r.isInterState).toBe(true);
      expect(r.gstScheme).toBe('REGULAR');
    });

    it('blocks a composition dealer from inter-state supply', () => {
      expect(() =>
        taxService.assertSaleAllowed(store({ gstNumber: '27ABCDE1234F1Z5', gstScheme: 'COMPOSITION' }), 24)
      ).toThrow(/COMPOSITION_INTERSTATE/);
    });

    it('treats a missing place-of-supply as the supplier state (intra)', () => {
      const r = taxService.assertSaleAllowed(store(), undefined);
      expect(r.isInterState).toBe(false);
    });
  });

  describe('allocateInvoiceNumber (atomic per-store-per-FY numbering)', () => {
    const STORE = '11111111-1111-1111-1111-111111111111';

    /** Fake tx: $queryRaw returns queued series rows; series.create/update are spies. */
    function makeTx(existingRows) {
      return {
        $queryRaw: jest.fn().mockResolvedValue(existingRows),
        invoiceSeries: {
          create: jest.fn().mockResolvedValue({ id: 'series-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
    }

    it('creates the series at 1 on the first invoice and formats the number', async () => {
      const tx = makeTx([]); // no existing series row
      const { invoiceNumber, financialYear } = await taxService.allocateInvoiceNumber(
        tx, STORE, '2025-26', 'TAX_INVOICE'
      );
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.invoiceSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nextNumber: 2 }) })
      );
      expect(financialYear).toBe('2025-26');
      expect(invoiceNumber).toBe('INV-202526-0001');
      expect(invoiceNumber.length).toBeLessThanOrEqual(16);
    });

    it('increments an existing series and pads the sequence', async () => {
      const tx = makeTx([{ id: 'series-1', prefix: 'INV', nextNumber: 42 }]);
      const { invoiceNumber } = await taxService.allocateInvoiceNumber(tx, STORE, '2025-26', 'TAX_INVOICE');
      expect(tx.invoiceSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { nextNumber: 43 },
      });
      expect(invoiceNumber).toBe('INV-202526-0042');
    });

    it('honours a custom prefix stored on the series row', async () => {
      const tx = makeTx([{ id: 'series-2', prefix: 'BOS', nextNumber: 7 }]);
      const { invoiceNumber } = await taxService.allocateInvoiceNumber(tx, STORE, '2025-26', 'BILL_OF_SUPPLY');
      expect(invoiceNumber).toBe('BOS-202526-0007');
    });
  });
});
