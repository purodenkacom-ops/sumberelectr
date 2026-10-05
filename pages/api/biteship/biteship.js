import axios from 'axios';
import { getShippingCost, getCoordinates } from '@/utils/biteship';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const {
      origin_area_id,
      destination_area_id,
      couriers,
      items,
      origin_address,
      destination_address,
      destination_latitude,
      destination_longitude,
    } = req.body || {};

    const courierStr = Array.isArray(couriers) ? couriers.join(',') : couriers || '';
    if (!courierStr) return res.status(400).json({ message: 'couriers wajib diisi' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items wajib diisi' });
    }

    const isInstant = /(^|,)(grab|gojek|lalamove)(,|$)/.test(courierStr);

    // ============ INSTANT FLOW ============
    if (isInstant) {
      let originLat = (typeof req.body?.origin_latitude === 'number') ? req.body.origin_latitude : null;
      let originLng = (typeof req.body?.origin_longitude === 'number') ? req.body.origin_longitude : null;
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        try {
          const { data: settingsRow } = await supabaseAdmin
            .from('settings')
            .select('*')
            .eq('type', 'pickups')
            .single();
          const primaryId = settingsRow?.primaryId || settingsRow?.primary_id || null;
          if (primaryId) {
            const { data: pRow } = await supabaseAdmin
              .from('pickup_locations')
              .select('*')
              .eq('id', String(primaryId))
              .single();
            if (pRow) {
              const latPick = pRow.latitude != null ? Number(pRow.latitude) : (pRow.area?.lat != null ? Number(pRow.area.lat) : null);
              const lngPick = pRow.longitude != null ? Number(pRow.longitude) : (pRow.area?.lng != null ? Number(pRow.area.lng) : null);
              if (Number.isFinite(latPick) && Number.isFinite(lngPick)) {
                originLat = latPick;
                originLng = lngPick;
              }
            }
          }
        } catch (e) {
          // silent fallback
        }
      }
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        originLat = parseFloat(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT || process.env.BITESHIP_ORIGIN_LAT);
        originLng = parseFloat(process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG || process.env.BITESHIP_ORIGIN_LNG);
      }
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        return res.status(500).json({ message: 'Origin latitude/longitude tidak terkonfigurasi' });
      }

      let destLat = typeof destination_latitude === 'number' ? destination_latitude : null;
      let destLng = typeof destination_longitude === 'number' ? destination_longitude : null;

      if ((destLat === null || destLng === null) && destination_address) {
        try {
          const coord = await getCoordinates(destination_address);
          if (coord) { destLat = coord.lat; destLng = coord.lng; }
        } catch (e) {}
      }

      if (typeof destLat !== 'number' || typeof destLng !== 'number') {
        return res.status(400).json({ message: 'Koordinat tujuan tidak valid / tidak ditemukan untuk kurir instant' });
      }

      const instantPayload = {
        couriers: courierStr,
        origin_latitude: originLat,
        origin_longitude: originLng,
        destination_latitude: destLat,
        destination_longitude: destLng,
        items,
      };

      const r = await axios.post('https://api.biteship.com/v1/rates/couriers', instantPayload, {
        headers: {
          Authorization: `Bearer ${process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      return res.status(200).json({ mode: 'instant', pricing: r.data?.pricing || [] });
    }

    // ============ REGULER / NON-INSTANT FLOW ============
    let primaryOriginAreaId = null;
    let primaryOriginAddress = null;
    try {
      const { data: settingsRow } = await supabaseAdmin
        .from('settings')
        .select('*')
        .eq('type', 'pickups')
        .single();
      const primaryId = settingsRow?.primaryId || settingsRow?.primary_id || null;
      if (primaryId) {
        const { data: pRow } = await supabaseAdmin
          .from('pickup_locations')
          .select('*')
          .eq('id', String(primaryId))
          .single();
        if (pRow) {
          primaryOriginAreaId = pRow.area_id || (pRow.areaId && pRow.postal_code ? (pRow.areaId + 'IDZ' + pRow.postal_code) : null);
          primaryOriginAddress = pRow.address || null;
        }
      }
    } catch (e) {
      // silent fallback to env
    }

    const finalOriginAreaId = primaryOriginAreaId || origin_area_id || process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_AREA_ID || process.env.BITESHIP_ORIGIN_AREA_ID;
    if (!finalOriginAreaId) {
      return res.status(400).json({ message: 'origin_area_id tidak tersedia (set NEXT_PUBLIC_BITESHIP_ORIGIN_AREA_ID atau kirim di body)' });
    }
    const finalDestAreaId = destination_area_id;
    if (!finalDestAreaId) {
      return res.status(400).json({ message: 'destination_area_id wajib diisi (non-instant)' });
    }

    const ratePayload = {
      origin_area_id: finalOriginAreaId,
      destination_area_id: finalDestAreaId,
      couriers: courierStr,
      items,
    };

    if (primaryOriginAddress) ratePayload.origin_address = primaryOriginAddress;
    else if (origin_address) ratePayload.origin_address = origin_address;
    if (destination_address) ratePayload.destination_address = destination_address;

    console.log('[Biteship API] Regular rates payload:', JSON.stringify(ratePayload, null, 2));

    const pricing = await getShippingCost(ratePayload);
    return res.status(200).json({ mode: 'regular', pricing });
  } catch (error) {
    console.error('[biteship rates error]', error.response?.data || error);
    return res.status(500).json({
      message: error.message || 'Gagal ambil tarif Biteship',
      details: error.response?.data || String(error)
    });
  }
}
