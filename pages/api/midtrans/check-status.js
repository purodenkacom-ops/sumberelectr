import midtransClient from 'midtrans-client';
import { adminDb } from '@/utils/firebaseAdmin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { invoiceId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION || 'false') === 'true';
    const serverKey = process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY_SANDBOX;
    if (!serverKey) return res.status(500).json({ error: 'MIDTRANS server key missing' });

    const core = new midtransClient.CoreApi({ isProduction, serverKey, clientKey: process.env.MIDTRANS_CLIENT_KEY || process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY });

    // Load invoice
    const invRef = adminDb.collection('invoices').doc(String(invoiceId));
    const invSnap = await invRef.get();
    if (!invSnap.exists) return res.status(404).json({ error: 'Invoice not found' });
    const inv = invSnap.data();

    const orderId = inv?.midtrans?.order_id || inv.invoiceId || String(invoiceId);
    if (!orderId) return res.status(400).json({ error: 'order_id not found on invoice' });

    // Query Midtrans for latest status
    let status;
    try {
      status = await core.transaction.status(orderId);
    } catch (e) {
      // If base id fails (because we append random suffix in some flows), try find by latest stored order_id
      // Already using stored midtrans.order_id above; if not present, bail
      return res.status(502).json({ error: 'Failed to fetch status', detail: e?.message || 'unknown' });
    }

    const txStatus = String(status.transaction_status || '').toLowerCase();
    const mapped = txStatus === 'settlement' || txStatus === 'capture' ? 'paid'
      : txStatus === 'pending' ? 'awaiting_payment'
      : txStatus === 'deny' || txStatus === 'cancel' ? 'cancelled'
      : txStatus === 'expire' ? 'expired'
      : null;

    const update = {
      paymentMethod: 'midtrans',
      'midtrans.last_check': status,
      updatedAt: new Date()
    };
    if (mapped) {
      update.status = mapped;
      if (mapped === 'paid') update.paidAt = new Date();
    }

    await invRef.update(update);

    return res.status(200).json({ ok: true, mapped, status });
  } catch (e) {
    console.error('midtrans/check-status error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
