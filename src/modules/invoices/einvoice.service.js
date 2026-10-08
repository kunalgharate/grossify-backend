const config = require('../../shared/config');

/**
 * E-invoice (IRN) + e-way bill generation via a GSP/IRP provider.
 *
 * India mandates e-invoicing for B2B above a turnover threshold. This module
 * builds the IRP payload from an order/invoice and calls the configured GSP;
 * when no GSP is configured it returns a clear NOT_CONFIGURED result so billing
 * never breaks in dev. The payload builder is pure + testable; the live GSP call
 * is only exercised with real credentials.
 */

const isConfigured = () => Boolean(config.einvoice.baseUrl && config.einvoice.apiKey);

/** Is e-invoice mandatory for this seller turnover? (threshold in ₹) */
const isMandatory = (annualTurnoverInr) =>
  Number(annualTurnoverInr || 0) >= config.einvoice.thresholdInr;

/**
 * Pure: build the IRP e-invoice payload (NIC schema subset) from invoice data.
 * Kept provider-agnostic; GSPs accept this canonical shape or map from it.
 */
function buildIrpPayload({ invoice, seller, buyer, items }) {
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
    DocDtls: { Typ: 'INV', No: invoice.invoiceNo, Dt: invoice.date },
    SellerDtls: {
      Gstin: seller.gstin,
      LglNm: seller.legalName,
      Addr1: seller.address,
      Loc: seller.city,
      Pin: seller.pincode,
      Stcd: seller.stateCode,
    },
    BuyerDtls: {
      Gstin: buyer.gstin || 'URP',
      LglNm: buyer.legalName || buyer.name,
      Pos: buyer.stateCode || seller.stateCode,
      Addr1: buyer.address,
      Loc: buyer.city,
      Pin: buyer.pincode,
      Stcd: buyer.stateCode,
    },
    ItemList: items.map((it, i) => ({
      SlNo: String(i + 1),
      PrdDesc: it.name,
      HsnCd: it.hsn,
      Qty: it.qty,
      Unit: it.unit || 'NOS',
      UnitPrice: it.unitPrice,
      TotAmt: it.taxable,
      GstRt: it.gstRate,
      IgstAmt: it.igst || 0,
      CgstAmt: it.cgst || 0,
      SgstAmt: it.sgst || 0,
      TotItemVal: it.total,
    })),
    ValDtls: {
      AssVal: invoice.taxableValue,
      IgstVal: invoice.igst || 0,
      CgstVal: invoice.cgst || 0,
      SgstVal: invoice.sgst || 0,
      TotInvVal: invoice.total,
    },
  };
}

/**
 * Generate an IRN for an invoice. Returns { status, irn?, qrCode?, ackNo? }.
 * NOT_CONFIGURED when no GSP; the caller stores whatever comes back.
 */
async function generateIrn({ invoice, seller, buyer, items }) {
  if (!isConfigured()) {
    return { status: 'NOT_CONFIGURED', message: 'E-invoice GSP not configured (EINVOICE_BASE_URL / EINVOICE_API_KEY).' };
  }
  const payload = buildIrpPayload({ invoice, seller, buyer, items });
  try {
    const res = await fetch(`${config.einvoice.baseUrl}/einvoice/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.einvoice.apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: 'FAILED', httpStatus: res.status };
    const body = await res.json();
    return { status: 'GENERATED', irn: body.Irn, qrCode: body.SignedQRCode, ackNo: body.AckNo, raw: body };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}

/**
 * Generate an e-way bill (for goods movement above the state threshold).
 * Same configured/stub pattern.
 */
async function generateEwayBill({ irn, transport }) {
  if (!isConfigured()) {
    return { status: 'NOT_CONFIGURED', message: 'E-way bill GSP not configured.' };
  }
  try {
    const res = await fetch(`${config.einvoice.baseUrl}/ewaybill/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.einvoice.apiKey}` },
      body: JSON.stringify({ Irn: irn, TransMode: transport?.mode || '1', Distance: transport?.distanceKm || 0, VehNo: transport?.vehicleNo }),
    });
    if (!res.ok) return { status: 'FAILED', httpStatus: res.status };
    const body = await res.json();
    return { status: 'GENERATED', ewbNo: body.EwbNo, validUpto: body.EwbValidTill, raw: body };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}

module.exports = { isConfigured, isMandatory, buildIrpPayload, generateIrn, generateEwayBill };
