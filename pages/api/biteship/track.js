import { supabaseAdmin } from '@/utils/supabaseAdmin';
import axios from 'axios';

const MAP_FINAL = {
  delivered: 'completed',
  completed: 'completed',
  returned: 'returned',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  couriernotfound: 'cancelled',
  disposed: 'cancelled'
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { waybill, courier, invoiceId } = req.query;
  const apiKey = process.env.BITESHIP_API_KEY || process.env.NEXT_PUBLIC_BITESHIP_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Biteship API key not configured' });
  if (!waybill || !courier) return res.status(400).json({ error: 'waybill and courier required' });

  try {
    const r = await axios.get(`https://api.biteship.com/v1/trackings/${waybill}/couriers/${courier}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const data = r.data || {};
    const trackingStatus = (data.status || '').toLowerCase();
    const mapped = MAP_FINAL[trackingStatus];

    if (invoiceId && mapped) {
      await supabaseAdmin.from('invoices').update({ status: mapped, updated_at: new Date().toISOString() }).eq('id', String(invoiceId));
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Biteship track error:', err?.response?.data || err.message);
    return res.status(500).json({ error: err?.response?.data?.message || err.message });
  }
}
