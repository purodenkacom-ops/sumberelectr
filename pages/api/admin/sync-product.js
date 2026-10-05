import { supabaseAdmin } from '@/utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, ...product } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  // Kolom sesuai schema Supabase yang ada
  const row = {
    id,
    name: product.name || null,
    slug: product.productSlug || product.slug || null,
    category: product.category || null,
    category_id: product.categoryId || null,
    category_slug: product.categorySlug || null,
    sub_category: product.subCategory || null,
    sub_category_slug: product.subCategorySlug || null,
    price: Number(product.price) || 0,
    price_retail: Number(product.priceRetail || product.price) || 0,
    price_wholesale: product.priceWholesale ? Number(product.priceWholesale) : null,
    stock: Number(product.stock) || 0,
    weight: product.weight ? Number(product.weight) : null,
    description: product.description || null,
    images: Array.isArray(product.images) ? product.images : [],
    size_variants: Array.isArray(product.sizeVariants) ? product.sizeVariants : [],
    metadata: {
      sku: product.sku || null,
      video: product.video || null,
      cloudinaryPublicIds: Array.isArray(product.cloudinaryPublicIds) ? product.cloudinaryPublicIds : [],
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('products')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('sync-product error:', error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
