import { supabaseAdmin } from '@/utils/supabaseAdmin';
import sgMail from '@sendgrid/mail';

if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function formatRupiah(number = 0) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(number);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { invoiceId } = req.body || {};
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });

  try {
    const { data: inv, error: fetchErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    let buyerEmail = inv.buyer_email || inv.email || inv.buyer?.email || null;
    let buyerName = inv.buyer_name || inv.buyer?.name || '';

    if (!buyerEmail && inv.buyer_id) {
      try {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('email, name, display_name')
          .eq('id', inv.buyer_id)
          .single();
        if (userRow) {
          buyerEmail = buyerEmail || userRow.email || null;
          buyerName = buyerName || userRow.name || userRow.display_name || '';
        }
      } catch (e) {
        console.warn('Failed lookup user for buyer_id:', e.message || e);
      }
    }

    if (!buyerEmail) return res.status(422).json({ error: 'Buyer email not found' });

    const amount = inv.grand_total || inv.grandTotal || inv.total || 0;
    const subject = `Pengingat Pembayaran - Invoice ${invoiceId}`;
    const text = `Halo ${buyerName || ''},\n\nSilakan melakukan pembayaran untuk Invoice ${invoiceId} sebesar ${formatRupiah(amount)}.\n\nTerima kasih.`;
    const html = `<p>Halo ${buyerName || ''},</p><p>Silakan melakukan pembayaran untuk <strong>Invoice ${invoiceId}</strong> sebesar <strong>${formatRupiah(amount)}</strong>.</p><p>Terima kasih.</p>`;

    if (process.env.SENDGRID_API_KEY) {
      await sgMail.send({
        to: buyerEmail,
        from: process.env.EMAIL_FROM || 'no-reply@sumberelectr.com',
        subject,
        text,
        html,
      });
    } else {
      console.log('EMAIL FALLBACK - send payment reminder:', { to: buyerEmail, subject, text });
    }

    const now = new Date().toISOString();
    const { data: cur } = await supabaseAdmin.from('invoices').select('payment_reminder_count').eq('id', invoiceId).single();
    const { error: updateErr } = await supabaseAdmin
      .from('invoices')
      .update({
        payment_reminder_sent_at: now,
        payment_reminder_count: ((cur?.payment_reminder_count || 0) + 1),
        updated_at: now,
      })
      .eq('id', invoiceId);
    if (updateErr) console.warn('send-payment-reminder update warn:', updateErr.message);

    return res.status(200).json({ ok: true, email: buyerEmail });
  } catch (err) {
    console.error('send-payment-reminder error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
