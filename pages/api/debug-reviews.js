import { adminDb } from '../../utils/firebaseAdmin';

export default async function handler(req, res) {
  const { productId } = req.query || {};
  if (!productId) return res.status(400).json({ error: 'productId query required' });
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  try {
    if (!adminDb) return res.status(500).json({ error: 'adminDb not initialized' });
    const snap = await adminDb.collection('reviews').where('productId', '==', String(productId)).get();
    const items = [];
    snap.forEach(d => {
      items.push({ id: d.id, ...(d.data() || {}) });
    });
    return res.status(200).json({ ok: true, count: items.length, items });
  } catch (err) {
    console.error('debug-reviews error', err);
    return res.status(500).json({ error: 'failed', details: String(err) });
  }
}
