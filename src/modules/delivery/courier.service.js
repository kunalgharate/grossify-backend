const config = require('../../shared/config');

/**
 * Courier/shipping aggregator integration (Shiprocket / Delhivery / DTDC /
 * India Post) for SHIPPED orders (durables, intercity/statewide — see §3.1.2 of
 * the PRD serviceability model). Provides AWB creation, label retrieval, and
 * inbound tracking-webhook normalization.
 *
 * Graceful fallback: when no courier is configured, createShipment returns a
 * NOT_CONFIGURED result so order flow never breaks; the hyperlocal (own-rider)
 * path is unaffected.
 */

const isConfigured = () => Boolean(config.courier.baseUrl && config.courier.apiKey);

/** Pure: build the aggregator shipment payload from an order + addresses. */
function buildShipmentPayload({ order, pickup, drop, parcel }) {
  return {
    order_id: order.orderNumber,
    order_date: (order.placedAt || new Date()).toISOString().slice(0, 10),
    pickup_location: {
      name: pickup.name,
      address: pickup.address,
      city: pickup.city,
      pincode: pickup.pincode,
      phone: pickup.phone,
    },
    billing_customer_name: drop.name,
    billing_address: drop.address,
    billing_city: drop.city,
    billing_pincode: drop.pincode,
    billing_phone: drop.phone,
    payment_method: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    sub_total: Number(order.total || 0),
    weight: parcel?.weightKg || 0.5,
    length: parcel?.lengthCm || 10,
    breadth: parcel?.breadthCm || 10,
    height: parcel?.heightCm || 10,
  };
}

/** Create a shipment + AWB. Returns { status, awb?, labelUrl?, courier? }. */
async function createShipment({ order, pickup, drop, parcel }) {
  if (!isConfigured()) {
    return {
      status: 'NOT_CONFIGURED',
      message: 'Courier aggregator not configured (COURIER_BASE_URL / COURIER_API_KEY).',
    };
  }
  const payload = buildShipmentPayload({ order, pickup, drop, parcel });
  try {
    const res = await fetch(`${config.courier.baseUrl}/orders/create/adhoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.courier.apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { status: 'FAILED', httpStatus: res.status };
    const body = await res.json();
    return {
      status: 'CREATED',
      shipmentId: body.shipment_id,
      awb: body.awb_code,
      labelUrl: body.label_url,
      courier: body.courier_name,
      raw: body,
    };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}

async function getLabel(shipmentId) {
  if (!isConfigured()) return { status: 'NOT_CONFIGURED' };
  try {
    const res = await fetch(`${config.courier.baseUrl}/courier/generate/label?shipment_id=${shipmentId}`, {
      headers: { Authorization: `Bearer ${config.courier.apiKey}` },
    });
    if (!res.ok) return { status: 'FAILED', httpStatus: res.status };
    const body = await res.json();
    return { status: 'OK', labelUrl: body.label_url };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}

/**
 * Pure: normalize an inbound courier tracking webhook into our order-status
 * vocabulary. Different aggregators use different codes; this maps the common
 * Shiprocket-style statuses. Returns null for unknown/ignored events.
 */
function normalizeTrackingEvent(payload) {
  const raw = (payload.current_status || payload.status || '').toUpperCase();
  const map = {
    'PICKUP SCHEDULED': 'PICKED',
    'PICKED UP': 'PICKED',
    'IN TRANSIT': 'OUT_FOR_DELIVERY',
    'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    RTO: 'RTO',
    'RTO DELIVERED': 'RTO',
    CANCELLED: 'CANCELLED',
  };
  const mapped = map[raw];
  if (!mapped) return null;
  return {
    awb: payload.awb || payload.awb_code,
    orderNumber: payload.order_id,
    status: mapped,
    rawStatus: raw,
    at: payload.timestamp || new Date().toISOString(),
  };
}

module.exports = { isConfigured, buildShipmentPayload, createShipment, getLabel, normalizeTrackingEvent };
