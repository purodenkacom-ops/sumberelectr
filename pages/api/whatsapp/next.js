import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const fallback = process.env.NEXT_PUBLIC_ADMIN_WA || process.env.ADMIN_WA || null;

    const { data: settingsRow } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('type', 'whatsapp')
      .single();

    const numbers = Array.isArray(settingsRow?.numbers) ? settingsRow.numbers : [];
    if (!numbers.length) {
      return res.status(200).json({ number: fallback, rotated: false });
    }

    let idx = Number.isInteger(settingsRow?.rotation_index) ? settingsRow.rotation_index : 0;
    if (idx < 0 || idx >= numbers.length) idx = 0;
    const number = numbers[idx];
    const nextIdx = (idx + 1) % numbers.length;

    // Update rotation index
    await supabaseAdmin
      .from('settings')
      .upsert({ type: 'whatsapp', rotation_index: nextIdx }, { onConflict: 'type' });

    return res.status(200).json({ number, rotated: true, nextIdx });
  } catch (e) {
    console.error('whatsapp/next error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
