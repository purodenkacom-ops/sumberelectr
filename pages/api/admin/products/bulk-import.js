import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  try {
    const formatted = items.map((p) => {
      const name = p.name || 'Produk';
      const slug = (p.slug || name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return {
        id: p.id || String(Date.now() + Math.random()),
        name,
        slug,
        product_slug: slug,
        permalink: slug,
        category: p.category || '',
        category_slug: (p.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        sub_category: p.subCategory || '',
        sub_category_slug: (p.subCategory || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: p.description || '',
        image: p.image || (Array.isArray(p.images) ? p.images[0] : ''),
        images: Array.isArray(p.images) ? p.images : p.image ? [p.image] : [],
        price: Number(p.price || p.priceRetail || 0),
        price_retail: Number(p.priceRetail || p.price || 0),
        price_wholesale: Number(p.priceWholesale || p.price || 0),
        min_wholesale: parseInt(p.minWholesale, 10) || 1,
        discount: Number(p.discount || 0),
        weight: Number(p.weight || 0),
        stock: parseInt(p.stock, 10) || 0,
        sold: parseInt(p.sold, 10) || 0,
      };
    });

    const { error } = await supabaseAdmin.from('products').upsert(formatted);
    if (error) throw error;

    try {
      if (res.revalidate) {
        await res.revalidate('/all-product');
      }
    } catch (e) {
      console.warn('Revalidation notice:', e.message);
    }

    return res.status(200).json({
      success: true,
      count: formatted.length,
      message: `Successfully imported ${formatted.length} products.`,
    });
  } catch (error) {
    console.error('Error in bulk import:', error);
    return res.status(500).json({ error: error.message || 'Bulk import failed' });
  }
}
