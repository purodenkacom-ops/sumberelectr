import axios from 'axios';

// ================== Geocoding ==================
export async function getCoordinates(address) {
  if (!address) return null;
  try {
    const resp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY}`
    );
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].geometry.location; // { lat, lng }
    }
  } catch (e) {
    console.error('Geocode error:', e);
  }
  return null;
}

// ================== COD Region Helpers ==================
export const COD_ALLOWED_PROVINCES = [
  // Jawa
  'BANTEN',
  'DKI JAKARTA',
  'JAWA BARAT',
  'JAWA TENGAH',
  'DI YOGYAKARTA',
  'DAERAH ISTIMEWA YOGYAKARTA',
  'JAWA TIMUR',

  // Sumatra (kecuali Aceh & Sumbar)
  'LAMPUNG',
  'SUMATERA SELATAN',
  'BANGKA BELITUNG',
  'BENGKULU',
  'RIAU',
  'KEPULAUAN RIAU',
  'JAMBI',

  // Kalimantan
  'KALIMANTAN BARAT',
  'KALIMANTAN TENGAH',
  'KALIMANTAN SELATAN',
  'KALIMANTAN TIMUR',
  'KALIMANTAN UTARA',

  // Sulawesi
  'SULAWESI UTARA',
  'SULAWESI TENGAH',
  'SULAWESI SELATAN',
  'SULAWESI TENGGARA',
  'GORONTALO',
  'SULAWESI BARAT',

  // Bali & NTB
  'BALI',
  'NUSA TENGGARA BARAT'
];

export function isProvinceCodEligible(provinceRaw = '') {
  const p = (provinceRaw || '').toUpperCase().trim();
  return COD_ALLOWED_PROVINCES.includes(p);
}

// ================== Core Shipping Cost ==================
const BITESHIP_RATES_URL = 'https://api.biteship.com/v1/rates/couriers';

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeCouriers(couriers) {
  if (Array.isArray(couriers)) {
    return couriers.filter(Boolean).map(c => c.trim()).join(',');
  }
  return String(couriers || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)
    .join(',');
}

/**
 * Get shipping cost from Biteship
 * - Non instant: gunakan origin_area_id & destination_area_id
 * - Instant (grab/gojek): gunakan origin_latitude, origin_longitude, destination_latitude, destination_longitude
 *
 * @param {Object} params
 * @returns {Promise<Array>} pricing
 */
export async function getShippingCost(params = {}) {
  const {
    origin_area_id,
    destination_area_id,
    couriers = 'jne,tiki,sicepat,jnt,grab,gojek,lalamove',
    items = [],
    origin_address,
    destination_address,
    origin_latitude,
    origin_longitude,
    destination_latitude,
    destination_longitude,
  } = params;

  const couriersStr = normalizeCouriers(couriers);
  if (!couriersStr) throw new Error('No couriers provided');

  const isInstant = /(^|,)(grab|gojek|lalamove)(,|$)/.test(couriersStr);

  // Build items (fallback 1 item)
  const safeItems = (items && items.length)
    ? items.map(it => ({
        name: it.name || 'Item',
        description: it.description || '',
        value: Number(it.value ?? it.price ?? 10000) || 10000,
        weight: Number(it.weight) || 200,
        quantity: Number(it.quantity) || 1,
        length: it.length || 1,
        width: it.width || 1,
        height: it.height || 1
      }))
    : [{
        name: 'Default Item',
        description: '',
        value: 10000,
        weight: 200,
        quantity: 1,
        length: 10,
        width: 10,
        height: 10
      }];

  let payload;

  if (isInstant) {
    // Instant requires coordinates
    let oLat = typeof origin_latitude === 'number' ? origin_latitude : null;
    let oLng = typeof origin_longitude === 'number' ? origin_longitude : null;

    // Fallback origin lat/lng from env
    if (oLat == null || oLng == null) {
      if (process.env.BITESHIP_ORIGIN_LAT && process.env.BITESHIP_ORIGIN_LNG) {
        oLat = Number(process.env.BITESHIP_ORIGIN_LAT);
        oLng = Number(process.env.BITESHIP_ORIGIN_LNG);
      } else if (process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT && process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG) {
        oLat = Number(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT);
        oLng = Number(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG);
      }
    }

    // Destination coordinates
    let dLat = typeof destination_latitude === 'number' ? destination_latitude : null;
    let dLng = typeof destination_longitude === 'number' ? destination_longitude : null;

    // If destination coords not provided but have address, geocode
    if ((dLat == null || dLng == null) && destination_address) {
      const coord = await getCoordinates(destination_address);
      if (coord) {
        dLat = coord.lat;
        dLng = coord.lng;
      }
    }

    if (![oLat,oLng,dLat,dLng].every(n => Number.isFinite(n))) {
      throw new Error('Instant courier requires valid origin/destination coordinates');
    }

    // Enforce max instant radius (default 40km, configurable via env)
    const maxKm = Number(process.env.INSTANT_MAX_RADIUS_KM || process.env.NEXT_PUBLIC_INSTANT_MAX_RADIUS_KM || 40);
    const distKm = haversineKm(oLat, oLng, dLat, dLng);
    if (distKm > maxKm) {
      throw new Error(`Jarak pengantaran melebihi batas ${maxKm} km untuk kurir instant (≈ ${distKm.toFixed(1)} km)`);
    }

    payload = {
      couriers: couriersStr,
      items: safeItems,
      origin_latitude: oLat,
      origin_longitude: oLng,
      destination_latitude: dLat,
      destination_longitude: dLng,
    };
  } else {
    // Non instant uses area IDs
    if (!origin_area_id || !destination_area_id) {
      throw new Error('Area IDs required for non-instant courier');
    }
    payload = {
      origin_area_id,
      destination_area_id,
      couriers: couriersStr,
      items: safeItems,
    };
  }

  try {
    const axios = (await import('axios')).default;
    const apiKey = process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Biteship API key (set BITESHIP_API_KEY or NEXT_PUBLIC_BITESHIP_API_KEY)');
    }
    const resp = await axios.post(BITESHIP_RATES_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const pricing = resp.data?.pricing;
    if (!pricing || !Array.isArray(pricing) || pricing.length === 0) {
      throw new Error('No pricing returned');
    }

    // === FILTER JNE: gunakan daftar JSON-like "yes,ctc,reguler" (tambahkan 'reg' untuk variasi API) ===
    const JNE_ALLOWED_SERVICE_CODES = "yes,ctc,reg,reguler"; // format yang dimaksud
    const ALLOWED_JNE_SET = new Set(
      JNE_ALLOWED_SERVICE_CODES.split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    );

    const filtered = pricing.filter(p => {
      if ((p.courier_code || '').toLowerCase() !== 'jne') return true;

      const codeRaw = (
        p.courier_service_code ||
        p.service_code ||
        p.service_type ||
        p.courier_service_name ||
        p.service ||
        ''
      ).toString().toLowerCase();

      // Buang trucking / jtr
      if (codeRaw.includes('truck') || codeRaw.includes('jtr')) return false;

      // Pecah token & cek apakah salah satu termasuk whitelist
      const tokens = codeRaw.split(/[\s\-_/]+/);
      return tokens.some(t => ALLOWED_JNE_SET.has(t));
    });

    return filtered;
  } catch (err) {
    const resp = err.response;
    const data = resp?.data;
    const statusInfo = resp ? `${resp.status} ${resp.statusText || ''}`.trim() : '';
    const apiMsg = (data && (data.message || data.error || data.errors?.[0])) || '';
    const finalMsg = apiMsg || (statusInfo ? `Unable to fetch shipping cost (${statusInfo})` : (err.message || 'Unable to fetch shipping cost'));
    console.error('Biteship rates error:', { message: finalMsg, original: err.message, status: resp?.status, data });
    throw new Error(finalMsg);
  }
}