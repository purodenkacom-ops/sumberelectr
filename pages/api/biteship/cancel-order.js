import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { invoiceId, reasonCode, reasonText } = req.body || {};
    if (!invoiceId || !reasonCode) {
      return res.status(400).json({ error: 'invoiceId & reasonCode required' });
    }

    const key = process.env.BITESHIP_API_KEY;
    if (!key) return res.status(500).json({ error: 'Missing BITESHIP_API_KEY' });

    // Ambil invoice
    const { data: inv, error: fetchErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    const orderId = inv.biteship?.id || inv.cod_order_id || inv.waybill_id || inv.extra?.id;
    let biteshipResponse = null;

    if (orderId) {
      const resp = await fetch(`https://api.biteship.com/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancellation_reason_code: reasonCode,
          cancellation_reason: reasonText || ''
        })
      });
      const json = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ error: json?.message || 'Cancel failed', biteship: json });
      }
      biteshipResponse = json;
    }

    // Arsipkan
    const { error: archiveErr } = await supabaseAdmin
      .from('invoices_archive')
      .insert({
        ...inv,
        archived_at: new Date().toISOString(),
        archived_reason_code: reasonCode,
        archived_reason_text: reasonText || '',
        archived_by: 'admin_api',
        biteship_cancel: biteshipResponse || null,
        final_status: 'cancelled'
      });
    if (archiveErr) throw new Error('Archive failed: ' + archiveErr.message);

    // Hapus dari invoices
    const { error: delErr } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', invoiceId);
    if (delErr) throw new Error('Delete failed: ' + delErr.message);

    return res.json({
      success: true,
      message: 'Invoice cancelled & archived',
      biteship: biteshipResponse
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
