jest.mock('../../src/shared/config', () => ({
  courier: { provider: 'shiprocket', baseUrl: undefined, apiKey: undefined },
}));

const config = require('../../src/shared/config');
const courier = require('../../src/modules/delivery/courier.service');

describe('courier.service', () => {
  beforeEach(() => {
    config.courier.baseUrl = undefined;
    config.courier.apiKey = undefined;
  });

  it('buildShipmentPayload maps order + addresses', () => {
    const p = courier.buildShipmentPayload({
      order: { orderNumber: 'G123', total: 500, paymentMethod: 'COD', placedAt: new Date('2026-10-08') },
      pickup: { name: 'Store', address: 'A', city: 'Pune', pincode: '411052', phone: '9' },
      drop: { name: 'Cust', address: 'B', city: 'Mumbai', pincode: '400001', phone: '8' },
      parcel: { weightKg: 1.2 },
    });
    expect(p.order_id).toBe('G123');
    expect(p.payment_method).toBe('COD');
    expect(p.weight).toBe(1.2);
    expect(p.billing_city).toBe('Mumbai');
  });

  it('createShipment returns NOT_CONFIGURED without creds', async () => {
    const r = await courier.createShipment({ order: { orderNumber: 'G1' }, pickup: {}, drop: {} });
    expect(r.status).toBe('NOT_CONFIGURED');
  });

  it('normalizeTrackingEvent maps aggregator statuses to our vocabulary', () => {
    expect(courier.normalizeTrackingEvent({ current_status: 'Delivered', order_id: 'G1' }).status).toBe('DELIVERED');
    expect(courier.normalizeTrackingEvent({ current_status: 'In Transit' }).status).toBe('OUT_FOR_DELIVERY');
    expect(courier.normalizeTrackingEvent({ current_status: 'RTO' }).status).toBe('RTO');
  });

  it('normalizeTrackingEvent ignores unknown statuses', () => {
    expect(courier.normalizeTrackingEvent({ current_status: 'SOMETHING_ELSE' })).toBeNull();
  });
});
