import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    category,
    subCategory,
    sort = 'default',
    page = '1',
    limit = '16',
    promoOnly = 'false',
    q = ''
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 16));
  const offset = (pageNum - 1) * limitNum;

  try {
    let query = supabaseAdmin
      .from('products')
      .select('*', { count: 'exact' });

    if (category) {
      query = query.or(`category.ilike.${category},category_slug.ilike.${category}`);
    }
    if (subCategory) {
      query = query.or(`sub_category.ilike.${subCategory},sub_category_slug.ilike.${subCategory}`);
    }
    if (promoOnly === 'true') {
      query = query.gt('discount', 0);
    }
    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

    switch (sort) {
      case 'az':
        query = query.order('name', { ascending: true });
        break;
      case 'price-asc':
        query = query.order('price_retail', { ascending: true });
        break;
      case 'price-desc':
        query = query.order('price_retail', { ascending: false });
        break;
      case 'best-selling':
        query = query.order('sold', { ascending: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('name', { ascending: true });
        break;
    }

    const { data, count, error } = await query.range(offset, offset + limitNum - 1);
    if (error) throw error;

    return res.status(200).json({
      products: data || [],
      pagination: {
        total: count || 0,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((count || 0) / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error in /api/products/paged:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
