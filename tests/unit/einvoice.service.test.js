jest.mock('../../src/shared/config', () => ({
  einvoice: { baseUrl: undefined, apiKey: undefined, gstin: undefined, thresholdInr: 50000000 },
}));

const config = require('../../src/shared/config');
const einvoice = require('../../src/modules/invoices/einvoice.service');

const sample = {
  invoice: { invoiceNo: 'GRS/2026-27/0001', date: '2026-10-08', taxableValue: 1000, cgst: 25, sgst: 25, total: 1050 },
  seller: { gstin: '27AAAAA0000A1Z5', legalName: 'Oven Fresh', address: 'MIT Rd', city: 'Pune', pincode: '411052', stateCode: 27 },
  buyer: { name: 'Customer', stateCode: 27 },
  items: [{ name: 'Bread', hsn: '1905', qty: 2, unitPrice: 500, taxable: 1000, gstRate: 5, cgst: 25, sgst: 25, total: 1050 }],
};

describe('einvoice.service', () => {
  beforeEach(() => {
    config.einvoice.baseUrl = undefined;
    config.einvoice.apiKey = undefined;
  });

  it('isMandatory respects the turnover threshold', () => {
    expect(einvoice.isMandatory(60000000)).toBe(true);
    expect(einvoice.isMandatory(1000000)).toBe(false);
  });

  it('buildIrpPayload maps invoice→NIC schema subset', () => {
    const p = einvoice.buildIrpPayload(sample);
    expect(p.DocDtls.No).toBe('GRS/2026-27/0001');
    expect(p.SellerDtls.Gstin).toBe('27AAAAA0000A1Z5');
    expect(p.ItemList).toHaveLength(1);
    expect(p.ItemList[0].HsnCd).toBe('1905');
    expect(p.ValDtls.TotInvVal).toBe(1050);
  });

  it('generateIrn returns NOT_CONFIGURED without a GSP (no crash)', async () => {
    const r = await einvoice.generateIrn(sample);
    expect(r.status).toBe('NOT_CONFIGURED');
  });

  it('generateEwayBill returns NOT_CONFIGURED without a GSP', async () => {
    const r = await einvoice.generateEwayBill({ irn: 'x' });
    expect(r.status).toBe('NOT_CONFIGURED');
  });
});
