import { supabaseAdmin } from '@/utils/supabaseAdmin';
import fetch from 'node-fetch';
import { sendDeliveryStatusEmail } from '@/utils/mailer';

export default async function handler(req, res) {
  try {
    const { invoiceId, biteshipId } = req.query;

    let biteshipOrderId = biteshipId || null;
    let inv = null;

    if (invoiceId) {
      const { data: row } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('id', String(invoiceId))
        .single();
      if (row) {
        inv = row;
        biteshipOrderId =
          biteshipOrderId ||
          inv?.biteship?.id ||
          inv?.biteship_order_id ||
          inv?.tracking_order_id ||
          inv?.cod_order_id ||
          inv?.extra?.id ||
          null;
      }
    }

    if (!biteshipOrderId) {
      return res.status(400).json({ error: 'Missing Biteship order id' });
    }

    const upstream = await fetch(`https://api.biteship.com/v1/orders/${encodeURIComponent(biteshipOrderId)}`, {
      headers: { Authorization: `Bearer ${process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY}` }
    });
    const data = await upstream.json();

    if (!upstream.ok || data.success === false) {
      return res.status(upstream.status || 500).json({ error: data.error || 'Retrieve failed', detail: data });
    }

    if (inv && invoiceId && data) {
      const { error: updateErr } = await supabaseAdmin
        .from('invoices')
        .update({
          updated_at: new Date().toISOString(),
          extra: { ...(inv.extra || {}), id: data.id || biteshipOrderId },
          biteship_raw: data,
          biteship_status: data.status || data?.courier?.status || inv?.biteship_status || null,
          waybill_id: data?.courier?.waybill_id || inv?.waybill_id || null
        })
        .eq('id', String(invoiceId));
      if (updateErr) console.warn('retrieve-order update warn:', updateErr.message);
    }

    return res.status(200).json({
      biteshipStatus: data.status,
      waybill: data?.courier?.waybill_id || null,
      data
    });
  } catch (err) {
    console.error('retrieve-order error:', err);
    return res.status(500).json({ error: 'Internal retrieve error', detail: err.message });
  }
}
