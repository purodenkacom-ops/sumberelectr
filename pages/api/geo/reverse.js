export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat & lon required' });
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'purodenka-app/1.0 (contact: support@yourdomain.example)',
        'Accept': 'application/json'
      }
    });
    const data = await resp.json();
    // Mirror response with CORS headers for dev convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    return res.status(resp.ok ? 200 : resp.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'reverse_failed', message: e.message });
  }
}
