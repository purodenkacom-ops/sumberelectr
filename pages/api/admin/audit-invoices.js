import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .limit(500);
    if (error) throw error;

    const missing = [];
    const updates = [];

    for (const row of rows || []) {
      if (!row.buyer_id) {
        const guessed = row.buyer?.id || row.buyer?.uid || null;
        missing.push({ id: row.id, guessed });
        if (guessed) {
          updates.push(
            supabaseAdmin
              .from('invoices')
              .update({ buyer_id: guessed, updated_at: new Date().toISOString() })
              .eq('id', row.id)
          );
        }
      }
    }

    if (updates.length) await Promise.all(updates);

    return res.status(200).json({
      checked: (rows || []).length,
      fixed: missing.filter(m => m.guessed).length,
      missing
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
