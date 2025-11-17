import { adminDb } from '@/utils/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [snap, settingsSnap] = await Promise.all([
        adminDb.collection('pickup_locations').orderBy('createdAt','desc').get(),
        adminDb.collection('settings').doc('pickups').get()
      ]);
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      const primaryId = settingsSnap.exists ? (settingsSnap.data().primaryId || '') : '';
      return res.status(200).json({ list, primaryId });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action required' });

    if (action === 'add') {
      const { name, contactName, contactPhone, address, area, postal_code, latitude, longitude } = req.body || {};
      if (!name || !address) return res.status(422).json({ error: 'name and address required' });
      if (!area?.id) return res.status(422).json({ error: 'area (with id) required' });
      const now = FieldValue.serverTimestamp();
      const pc = String(postal_code || area.postal_code || '').trim();
      const area_id = area.id + (pc ? ('IDZ' + pc) : '');
      // Normalize coordinates: prefer provided latitude/longitude, else area.lat/lng, else null
      const latNum = (typeof latitude === 'number' && isFinite(latitude)) ? latitude : (typeof area?.lat === 'number' ? area.lat : null);
      const lngNum = (typeof longitude === 'number' && isFinite(longitude)) ? longitude : (typeof area?.lng === 'number' ? area.lng : null);
      const docRef = await adminDb.collection('pickup_locations').add({
        name: String(name).trim(),
        contactName: String(contactName || '').trim(),
        contactPhone: String(contactPhone || '').trim(),
        address: String(address).trim(),
        postal_code: pc,
        areaId: area.id,
        area,
        area_id,
        latitude: (latNum != null ? Number(latNum) : null),
        longitude: (lngNum != null ? Number(lngNum) : null),
        createdAt: now,
        updatedAt: now
      });
      const snap = await docRef.get();
      return res.status(200).json({ ok: true, id: docRef.id, row: { id: docRef.id, ...snap.data() } });
    }

    if (action === 'update') {
      const { id, name, contactName, contactPhone, address, area, postal_code, latitude, longitude } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      const payload = {
        updatedAt: FieldValue.serverTimestamp()
      };
      if (name != null) payload.name = String(name).trim();
      if (contactName != null) payload.contactName = String(contactName).trim();
      if (contactPhone != null) payload.contactPhone = String(contactPhone).trim();
      if (address != null) payload.address = String(address).trim();
      if (postal_code != null) payload.postal_code = String(postal_code).trim();
      // Coordinates: accept null to clear, number to set
      if (latitude === null) payload.latitude = null;
      else if (typeof latitude === 'number' && isFinite(latitude)) payload.latitude = Number(latitude);
      if (longitude === null) payload.longitude = null;
      else if (typeof longitude === 'number' && isFinite(longitude)) payload.longitude = Number(longitude);
      if (area?.id) {
        payload.areaId = area.id;
        payload.area = area;
        if (!payload.postal_code) payload.postal_code = String(area.postal_code || '');
        const pc2 = String(payload.postal_code || '').trim();
        payload.area_id = area.id + (pc2 ? ('IDZ' + pc2) : '');
        // If coordinates not explicitly provided in body, default from area when changing area
        if (payload.latitude === undefined && typeof area?.lat === 'number') payload.latitude = Number(area.lat);
        if (payload.longitude === undefined && typeof area?.lng === 'number') payload.longitude = Number(area.lng);
      } else if (payload.postal_code && payload.areaId) {
        // If postal code changed without new area selection, recompute area_id from existing areaId
        const pc3 = String(payload.postal_code).trim();
        payload.area_id = payload.areaId + (pc3 ? ('IDZ' + pc3) : '');
      }
      await adminDb.collection('pickup_locations').doc(String(id)).update(payload);
      return res.status(200).json({ ok: true });
    }

    if (action === 'remove') {
      const { id } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      await adminDb.collection('pickup_locations').doc(String(id)).delete();
      // Clear primary if it matches
      const sRef = adminDb.collection('settings').doc('pickups');
      const sSnap = await sRef.get();
      if (sSnap.exists && sSnap.data().primaryId === id) {
        await sRef.set({ primaryId: '' }, { merge: true });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'setPrimary') {
      const { id } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      await adminDb.collection('settings').doc('pickups').set({ primaryId: id }, { merge: true });
      return res.status(200).json({ ok: true, primaryId: id });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('pickups api error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
