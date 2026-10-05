import { supabaseAdmin } from '@/utils/supabaseAdmin';

async function requireAdmin(req) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    // Check role in users table
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile) return null;
    return (profile.role === 'admin') ? user : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(401).json({ error: 'Unauthorized' });

    const { action, number, rotationIndex } = req.body || {};

    const { data: settingsRow } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('type', 'whatsapp')
      .single();

    const data = settingsRow || {};
    let numbers = Array.isArray(data.numbers) ? data.numbers : [];
    let idx = Number.isInteger(data.rotation_index) ? data.rotation_index : 0;

    if (action === 'add') {
      if (!number) return res.status(400).json({ error: 'number required' });
      if (!numbers.includes(number)) numbers = [...numbers, number];
      await supabaseAdmin.from('settings').upsert({ type: 'whatsapp', numbers }, { onConflict: 'type' });
    } else if (action === 'remove') {
      if (!number) return res.status(400).json({ error: 'number required' });
      numbers = numbers.filter(n => n !== number);
      if (idx >= numbers.length) idx = 0;
      await supabaseAdmin.from('settings').upsert({ type: 'whatsapp', numbers, rotation_index: idx }, { onConflict: 'type' });
    } else if (action === 'setRotation') {
      const n = Number(rotationIndex);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'invalid rotationIndex' });
      idx = numbers.length ? Math.min(n, numbers.length - 1) : 0;
      await supabaseAdmin.from('settings').upsert({ type: 'whatsapp', rotation_index: idx }, { onConflict: 'type' });
    } else if (action === 'advance') {
      idx = numbers.length ? (idx + 1) % numbers.length : 0;
      await supabaseAdmin.from('settings').upsert({ type: 'whatsapp', rotation_index: idx }, { onConflict: 'type' });
    } else {
      return res.status(400).json({ error: 'invalid action' });
    }

    const { data: out } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('type', 'whatsapp')
      .single();

    return res.status(200).json({
      numbers: out?.numbers || [],
      rotationIndex: out?.rotation_index || 0
    });
  } catch (e) {
    console.error('wa-settings error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
