import { supabaseAdmin } from '@/utils/supabaseAdmin';
import reviewsData from '@/utils/reviews.json';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId required' });

  try {
    const names = Array.isArray(reviewsData.names) ? reviewsData.names : [];
    const reviews = Array.isArray(reviewsData.reviews) ? reviewsData.reviews : [];
    const toGenerate = 10;

    const start = new Date('2025-01-02T00:00:00Z').getTime();
    const end = new Date('2025-09-09T23:59:59Z').getTime();
    const randDate = () => new Date(start + Math.floor(Math.random() * (end - start + 1))).toISOString();

    const rows = [];
    for (let i = 0; i < toGenerate; i++) {
      const name = names[Math.floor(Math.random() * names.length)] || 'Pembeli';
      const rev = reviews[Math.floor(Math.random() * reviews.length)] || { comment: 'Good', rating: 5 };
      const rating = 3 + Math.floor(Math.random() * 3);
      rows.push({
        product_id: String(productId),
        name,
        comment: rev.comment,
        rating,
        created_at: randDate()
      });
    }

    const { data: created, error } = await supabaseAdmin
      .from('reviews')
      .insert(rows)
      .select();
    if (error) throw error;

    console.log(`[seed-reviews] created ${created.length} reviews for product ${productId}`);
    return res.status(200).json({ ok: true, created });
  } catch (err) {
    console.error('seed-reviews error', err);
    return res.status(500).json({ error: 'failed' });
  }
}
