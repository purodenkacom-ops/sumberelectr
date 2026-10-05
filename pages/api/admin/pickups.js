import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [locResult, settingsResult] = await Promise.all([
        supabaseAdmin.from('pickup_locations').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.from('settings').select('*').eq('type', 'pickups').single()
      ]);
      const list = locResult.data || [];
      const primaryId = settingsResult.data?.primaryId || settingsResult.data?.primary_id || '';
      return res.status(200).json({ list, primaryId });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action required' });

    if (action === 'add') {
      const { name, contactName, contactPhone, address, area, postal_code, latitude, longitude } = req.body || {};
      if (!name || !address) return res.status(422).json({ error: 'name and address required' });
      if (!area?.id) return res.status(422).json({ error: 'area (with id) required' });
      const pc = String(postal_code || area.postal_code || '').trim();
      const area_id = area.id + (pc ? ('IDZ' + pc) : '');
      const latNum = (typeof latitude === 'number' && isFinite(latitude)) ? latitude : (typeof area?.lat === 'number' ? area.lat : null);
      const lngNum = (typeof longitude === 'number' && isFinite(longitude)) ? longitude : (typeof area?.lng === 'number' ? area.lng : null);
      const now = new Date().toISOString();
      const { data: inserted, error } = await supabaseAdmin
        .from('pickup_locations')
        .insert({
          name: String(name).trim(),
          contact_name: String(contactName || '').trim(),
          contact_phone: String(contactPhone || '').trim(),
          address: String(address).trim(),
          postal_code: pc,
          area_id_ref: area.id,
          area,
          area_id,
          latitude: latNum != null ? Number(latNum) : null,
          longitude: lngNum != null ? Number(lngNum) : null,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, id: inserted.id, row: inserted });
    }

    if (action === 'update') {
      const { id, name, contactName, contactPhone, address, area, postal_code, latitude, longitude } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      const payload = { updated_at: new Date().toISOString() };
      if (name != null) payload.name = String(name).trim();
      if (contactName != null) payload.contact_name = String(contactName).trim();
      if (contactPhone != null) payload.contact_phone = String(contactPhone).trim();
      if (address != null) payload.address = String(address).trim();
      if (postal_code != null) payload.postal_code = String(postal_code).trim();
      if (latitude === null) payload.latitude = null;
      else if (typeof latitude === 'number' && isFinite(latitude)) payload.latitude = Number(latitude);
      if (longitude === null) payload.longitude = null;
      else if (typeof longitude === 'number' && isFinite(longitude)) payload.longitude = Number(longitude);
      if (area?.id) {
        payload.area_id_ref = area.id;
        payload.area = area;
        if (!payload.postal_code) payload.postal_code = String(area.postal_code || '');
        const pc2 = String(payload.postal_code || '').trim();
        payload.area_id = area.id + (pc2 ? ('IDZ' + pc2) : '');
        if (payload.latitude === undefined && typeof area?.lat === 'number') payload.latitude = Number(area.lat);
        if (payload.longitude === undefined && typeof area?.lng === 'number') payload.longitude = Number(area.lng);
      } else if (payload.postal_code && payload.area_id_ref) {
        const pc3 = String(payload.postal_code).trim();
        payload.area_id = payload.area_id_ref + (pc3 ? ('IDZ' + pc3) : '');
      }
      const { error } = await supabaseAdmin.from('pickup_locations').update(payload).eq('id', String(id));
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'remove') {
      const { id } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      const { error } = await supabaseAdmin.from('pickup_locations').delete().eq('id', String(id));
      if (error) throw error;
      // Clear primary if matches
      const { data: sRow } = await supabaseAdmin.from('settings').select('*').eq('type', 'pickups').single();
      if (sRow && (sRow.primaryId === id || sRow.primary_id === id)) {
        await supabaseAdmin.from('settings').upsert({ type: 'pickups', primaryId: '' }, { onConflict: 'type' });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'setPrimary') {
      const { id } = req.body || {};
      if (!id) return res.status(422).json({ error: 'id required' });
      await supabaseAdmin.from('settings').upsert({ type: 'pickups', primaryId: id }, { onConflict: 'type' });
      return res.status(200).json({ ok: true, primaryId: id });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('pickups api error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
