import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  const { productId } = req.query || {};
  if (!productId) return res.status(400).json({ error: 'productId query required' });
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
  try {
    const { data: items, error } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .eq('product_id', String(productId));
    if (error) throw error;
    return res.status(200).json({ ok: true, count: (items || []).length, items: items || [] });
  } catch (err) {
    console.error('debug-reviews error', err);
    return res.status(500).json({ error: 'failed', details: String(err) });
  }
}
