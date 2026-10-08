const config = require('../../shared/config');

/**
 * Delivery routing/ETA. Uses Google Maps Distance Matrix when GOOGLE_MAPS_API_KEY
 * is set (road distance + traffic-aware duration); otherwise falls back to a
 * haversine straight-line estimate so assignment/ETA always works in dev.
 */

const mapsEnabled = () => Boolean(config.maps.apiKey);

/** Pure: great-circle distance in km. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fallback estimate: assume ~20 km/h effective urban speed. */
function haversineEstimate(origin, dest) {
  const km = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const minutes = Math.round((km / 20) * 60);
  return { source: 'haversine', distanceKm: Math.round(km * 100) / 100, etaMinutes: minutes };
}

/** Distance + ETA between two points. Maps when configured, else haversine. */
async function estimate(origin, dest) {
  if (!mapsEnabled()) return haversineEstimate(origin, dest);
  try {
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}` +
      `&departure_time=now&key=${config.maps.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return haversineEstimate(origin, dest);
    const body = await res.json();
    const el = body.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return haversineEstimate(origin, dest);
    return {
      source: 'google_maps',
      distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
      etaMinutes: Math.round((el.duration_in_traffic?.value ?? el.duration.value) / 60),
    };
  } catch {
    return haversineEstimate(origin, dest);
  }
}

/**
 * Pure: pick the best candidate rider for an order by nearest straight-line
 * distance (used for assignment; swap to `estimate` for road-aware ranking when
 * Maps is configured).
 */
function nearestAgent(orderLocation, agents) {
  if (!agents || agents.length === 0) return null;
  return agents
    .map((a) => ({ ...a, distanceKm: haversineKm(orderLocation.lat, orderLocation.lng, a.lat, a.lng) }))
    .sort((x, y) => x.distanceKm - y.distanceKm)[0];
}

module.exports = { mapsEnabled, haversineKm, haversineEstimate, estimate, nearestAgent };
