import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userUid, guestSessionId, guestUid } = req.body || {};
  if (!userUid) return res.status(400).json({ error: 'userUid required' });
  if (!guestSessionId && !guestUid) return res.status(400).json({ error: 'guestSessionId or guestUid required' });

  try {
    if (guestSessionId) {
      await supabaseAdmin.from('invoices').update({ buyer_id: userUid, updated_at: new Date().toISOString() }).eq('guest_session_id', String(guestSessionId));
    }
    if (guestUid) {
      await supabaseAdmin.from('invoices').update({ buyer_id: userUid, updated_at: new Date().toISOString() }).eq('guest_uid', String(guestUid));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('merge-guest error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
