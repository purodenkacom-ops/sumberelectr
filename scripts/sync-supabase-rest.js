require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

const exportDir = path.join(__dirname, '../data-migration');

async function syncDirect() {
  console.log('Testing direct REST upsert to Supabase...');

  // 1. Categories
  const categoriesDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'categories.json'), 'utf8'));
  const catsPayload = categoriesDocs.map(d => ({
    id: d._id,
    name: d.name || d._id,
    slug: (d.slug || d.name || d._id).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || d._id,
    parent_id: d.parentId || d.parent_id || null,
    banner: d.banner || null,
    created_at: d.createdAt || d.created_at || new Date().toISOString(),
    updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
  }));

  console.log(`Upserting ${catsPayload.length} categories...`);
  const { data: catRes, error: catErr } = await supabase.from('categories').upsert(catsPayload);
  if (catErr) {
    console.error('Categories upsert error:', catErr);
    return;
  }
  console.log('✓ Categories upserted successfully!');

  // 2. Products in chunks of 200
  const productsDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'products.json'), 'utf8'));
  console.log(`Upserting ${productsDocs.length} products...`);
  const chunkSize = 200;
  for (let i = 0; i < productsDocs.length; i += chunkSize) {
    const chunk = productsDocs.slice(i, i + chunkSize).map(d => {
      const name = d.name || 'Produk';
      const slug = (d.slug || d.productSlug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || d._id;
      const images = Array.isArray(d.images) ? d.images : d.image ? [d.image] : [];
      return {
        id: d._id,
        name,
        slug,
        product_slug: d.productSlug || slug,
        permalink: d.permalink || slug,
        category: d.category || null,
        category_slug: (d.categorySlug || d.category || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || null,
        sub_category: d.subCategory || null,
        sub_category_slug: (d.subCategorySlug || d.subCategory || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || null,
        description: d.description || null,
        image: d.image || images[0] || null,
        images: images,
        price: Number(d.price || d.priceRetail || 0),
        price_retail: Number(d.priceRetail || d.price || 0),
        price_wholesale: Number(d.priceWholesale || d.price || 0),
        min_wholesale: Number(d.minWholesale || 1),
        discount: Number(d.discount || 0),
        weight: Number(d.weight || 500),
        stock: Number(d.stock || 0),
        sold: Number(d.sold || 0),
        sales_count: Number(d.salesCount || 0),
        rating: Number(d.rating || 0),
        review_count: Number(d.reviewCount || 0),
        size_variants: d.sizeVariants || [],
        specifications: d.specifications || {},
        created_at: d.createdAt || d.created_at || new Date().toISOString(),
        updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
      };
    });

    const { error: prodErr } = await supabase.from('products').upsert(chunk);
    if (prodErr) {
      console.error(`Error at product chunk ${i}-${i + chunk.length}:`, prodErr);
      return;
    }
    console.log(`✓ Products chunk ${i + chunk.length}/${productsDocs.length}`);
  }

  // 3. Invoices
  const invoicesDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'invoices.json'), 'utf8'));
  console.log(`Upserting ${invoicesDocs.length} invoices...`);
  const invPayload = invoicesDocs.map(d => ({
    id: d._id,
    buyer_id: d.buyerId || d.buyer_id || null,
    buyer_name: d.buyerName || d.buyer_name || null,
    buyer_email: d.buyerEmail || d.buyer_email || null,
    buyer_phone: d.buyerPhone || d.buyer_phone || null,
    guest_uid: d.guestUid || d.guest_uid || null,
    guest_session_id: d.guestSessionId || d.guest_session_id || null,
    status: d.status || 'draft',
    payment_method: d.paymentMethod || d.payment_method || null,
    payment_gateway: d.paymentGateway || d.payment_gateway || null,
    items: d.items || [],
    subtotal: Number(d.subtotal || 0),
    shipping_cost: Number(d.shippingCost || d.shipping_cost || 0),
    discount_amount: Number(d.discountAmount || d.discount_amount || 0),
    grand_total: Number(d.grandTotal || d.grand_total || 0),
    shipping_address: d.shippingAddress || d.shipping_address || {},
    shipping_selection: d.shippingSelection || d.shipping_selection || {},
    biteship: d.biteship || {},
    midtrans: d.midtrans || {},
    xendit: d.xendit || {},
    created_at: d.createdAt || d.created_at || new Date().toISOString(),
    updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
  }));
  await supabase.from('invoices').upsert(invPayload);
  console.log('✓ Invoices synced.');

  // 4. Banners
  const bannersDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'banners.json'), 'utf8'));
  console.log(`Upserting ${bannersDocs.length} banners...`);
  const bannersPayload = bannersDocs.map(d => ({
    id: d._id,
    title: d.title || null,
    image: d.image || d.imageUrl || '',
    link: d.link || d.url || null,
    active: d.active !== false,
    order: Number(d.order || 0),
    created_at: d.createdAt || d.created_at || new Date().toISOString(),
    updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
  }));
  await supabase.from('banners').upsert(bannersPayload);
  console.log('✓ Banners synced.');

  // 5. Reviews
  const reviewsDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'reviews.json'), 'utf8'));
  console.log(`Upserting ${reviewsDocs.length} reviews...`);
  const reviewsPayload = reviewsDocs.map(d => ({
    id: d._id,
    product_id: d.productId || d.product_id || 'unknown',
    buyer_id: d.buyerId || d.buyer_id || null,
    user_name: d.userName || d.user_name || d.name || 'User',
    user_image: d.userImage || d.user_image || null,
    rating: Number(d.rating || 5),
    comment: d.comment || d.review || null,
    images: d.images || [],
    created_at: d.createdAt || d.created_at || new Date().toISOString(),
  }));
  await supabase.from('reviews').upsert(reviewsPayload);
  console.log('✓ Reviews synced.');

  console.log('=== All data migration successfully synced to Supabase! ===');
}

syncDirect().catch(console.error);
