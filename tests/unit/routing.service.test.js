jest.mock('../../src/shared/config', () => ({ maps: { apiKey: undefined } }));

const config = require('../../src/shared/config');
const routing = require('../../src/modules/delivery/routing.service');

describe('routing.service', () => {
  beforeEach(() => {
    config.maps.apiKey = undefined;
  });

  it('haversineKm computes a sane distance (Pune↔Mumbai ~120km)', () => {
    const km = routing.haversineKm(18.5204, 73.8567, 19.076, 72.8777);
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(160);
  });

  it('estimate falls back to haversine when Maps is disabled', async () => {
    const r = await routing.estimate({ lat: 18.5, lng: 73.8 }, { lat: 18.6, lng: 73.9 });
    expect(r.source).toBe('haversine');
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.etaMinutes).toBeGreaterThan(0);
  });

  it('nearestAgent picks the closest rider', () => {
    const order = { lat: 18.5, lng: 73.8 };
    const agents = [
      { id: 'far', lat: 19.5, lng: 74.8 },
      { id: 'near', lat: 18.51, lng: 73.81 },
    ];
    expect(routing.nearestAgent(order, agents).id).toBe('near');
  });

  it('nearestAgent returns null with no agents', () => {
    expect(routing.nearestAgent({ lat: 0, lng: 0 }, [])).toBeNull();
  });
});
