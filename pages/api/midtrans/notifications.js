import { supabaseAdmin } from '@/utils/supabaseAdmin';
import crypto from 'crypto';

function mapStatus(s) {
  const st = String(s || '').toLowerCase();
  switch (st) {
    case 'capture':
    case 'settlement':
      return 'paid';
    case 'pending':
      return 'awaiting_payment';
    case 'deny':
    case 'cancel':
      return 'cancelled';
    case 'expire':
      return 'expired';
    default:
      return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const {
      order_id,
      transaction_status,
      status_code,
      gross_amount,
      payment_type,
      signature_key
    } = req.body || {};

    if (!order_id) return res.status(400).json({ error: 'order_id missing' });

    try {
      const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY_SANDBOX;
      if (signature_key && serverKey) {
        const payload = `${order_id}${status_code}${gross_amount}${serverKey}`;
        const expected = crypto.createHash('sha512').update(payload).digest('hex');
        if (String(signature_key) !== String(expected)) {
          return res.status(403).json({ error: 'Invalid signature' });
        }
      }
    } catch (e) {
      console.warn('Midtrans signature verification warning:', e.message);
    }

    const baseInvoiceId = String(order_id).split('-')[0];
    const newStatus = mapStatus(transaction_status);

    if (newStatus) {
      await supabaseAdmin.from('invoices').update({
        status: newStatus,
        payment_gateway: 'midtrans',
        payment_method: payment_type || 'midtrans',
        updated_at: new Date().toISOString(),
      }).eq('id', baseInvoiceId);
    }

    return res.status(200).json({ status: 'OK' });
  } catch (err) {
    console.error('Midtrans notification error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
