import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY || process.env.XENDIT_API_KEY;
  if (!XENDIT_SECRET_KEY) {
    return res.status(500).json({ error: 'Missing Xendit secret key' });
  }

  try {
    const {
      invoiceId,
      amount,
      payer_email,
      payer_name,
      payer_phone,
      description,
      success_url,
      failure_url,
    } = req.body || {};

    if (!invoiceId || !amount) {
      return res.status(400).json({ error: 'invoiceId and amount are required' });
    }

    const auth = Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64');
    const payload = {
      external_id: String(invoiceId),
      amount: Math.max(1, Math.round(Number(amount))),
      currency: 'IDR',
      description: description || `Invoice ${invoiceId}`,
      payer_email: payer_email || undefined,
      customer: (payer_name || payer_email || payer_phone) ? {
        given_names: payer_name || undefined,
        email: payer_email || undefined,
        mobile_number: payer_phone || undefined,
      } : undefined,
      success_redirect_url: success_url || undefined,
      failure_redirect_url: failure_url || undefined,
      invoice_duration: 86400,
    };

    const response = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Xendit API error', details: data });
    }

    await supabaseAdmin.from('invoices').update({
      xendit: data,
      updated_at: new Date().toISOString(),
    }).eq('id', String(invoiceId));

    return res.status(200).json(data);
  } catch (err) {
    console.error('Xendit create-invoice error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
