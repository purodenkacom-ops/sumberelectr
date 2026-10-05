export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const key = process.env.BITESHIP_API_KEY;
    if (!key) return res.status(500).json({ error: 'Missing BITESHIP_API_KEY' });

    const r = await fetch('https://api.biteship.com/v1/orders/cancellation_reasons?lang=id', {
      headers: { Authorization: `Bearer ${key}` }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.message || 'Fetch reasons failed' });

    return res.json({ reasons: data?.cancellation_reasons || data?.data || data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
