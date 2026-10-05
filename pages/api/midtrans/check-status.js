import midtransClient from 'midtrans-client';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { invoiceId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION || 'false') === 'true';
    const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY_SANDBOX;
    if (!serverKey) return res.status(500).json({ error: 'MIDTRANS server key missing' });

    const core = new midtransClient.CoreApi({
      isProduction,
      serverKey,
      clientKey: process.env.MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
    });

    const { data: inv, error: fetchErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', String(invoiceId))
      .single();
    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    const orderId = inv?.midtrans?.order_id || inv.invoice_id || String(invoiceId);
    if (!orderId) return res.status(400).json({ error: 'order_id not found on invoice' });

    let status;
    try {
      status = await core.transaction.status(orderId);
    } catch (e) {
      return res.status(502).json({ error: 'Failed to fetch status', detail: e?.message || 'unknown' });
    }

    const txStatus = String(status.transaction_status || '').toLowerCase();
    const mapped = txStatus === 'settlement' || txStatus === 'capture' ? 'paid'
      : txStatus === 'pending' ? 'awaiting_payment'
      : txStatus === 'deny' || txStatus === 'cancel' ? 'cancelled'
      : txStatus === 'expire' ? 'expired'
      : null;

    const update = {
      payment_method: 'midtrans',
      midtrans: { ...(inv.midtrans || {}), last_check: status },
      updated_at: new Date().toISOString()
    };
    if (mapped) {
      update.status = mapped;
      if (mapped === 'paid') update.paid_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabaseAdmin
      .from('invoices')
      .update(update)
      .eq('id', String(invoiceId));
    if (updateErr) console.warn('check-status update warn:', updateErr.message);

    return res.status(200).json({ ok: true, mapped, status });
  } catch (e) {
    console.error('midtrans/check-status error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
