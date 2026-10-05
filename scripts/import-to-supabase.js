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

async function importAll() {
  console.log('--- Memulai Import Data via Supabase API ---');

  // 1. Categories
  if (fs.existsSync(path.join(exportDir, 'categories.json'))) {
    const cats = JSON.parse(fs.readFileSync(path.join(exportDir, 'categories.json'), 'utf8'));
    console.log(`Importing ${cats.length} categories...`);
    const catsPayload = cats.map(d => ({
      id: String(d._id),
      name: d.name || d._id,
      slug: (d.slug || d.name || d._id).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(d._id),
      parent_id: d.parentId || d.parent_id || null,
      banner: d.banner || null,
      metadata: d.metadata || {},
      created_at: d.createdAt || d.created_at || new Date().toISOString(),
      updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('categories').upsert(catsPayload);
    if (error) {
      console.error('Error importing categories:', error);
      return;
    }
    console.log('✓ Categories selesai.');
  }

  // 2. Users
  if (fs.existsSync(path.join(exportDir, 'users.json'))) {
    const users = JSON.parse(fs.readFileSync(path.join(exportDir, 'users.json'), 'utf8'));
    console.log(`Importing ${users.length} users...`);
    const usersPayload = users.map(d => ({
      id: String(d._id),
      firebase_uid: String(d._id),
      email: d.email || null,
      role: d.role || 'buyer',
      profile: d.profile || {},
      created_at: d.createdAt || d.created_at || new Date().toISOString(),
      updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('users').upsert(usersPayload);
    if (error) console.error('Error importing users:', error);
    else console.log('✓ Users selesai.');
  }

  // 3. Products (Batching per 100)
  if (fs.existsSync(path.join(exportDir, 'products.json'))) {
    const prods = JSON.parse(fs.readFileSync(path.join(exportDir, 'products.json'), 'utf8'));
    console.log(`Importing ${prods.length} products...`);
    const batchSize = 100;
    for (let i = 0; i < prods.length; i += batchSize) {
      const chunk = prods.slice(i, i + batchSize).map(d => {
        const name = d.name || 'Produk';
        const slug = (d.slug || d.productSlug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(d._id);
        const images = Array.isArray(d.images) ? d.images : d.image ? [d.image] : [];
        return {
          id: String(d._id),
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
          metadata: d.metadata || {},
          created_at: d.createdAt || d.created_at || new Date().toISOString(),
          updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
        };
      });

      const { error } = await supabase.from('products').upsert(chunk);
      if (error) {
        console.error(`Error at product batch ${i}-${i + chunk.length}:`, error);
        return;
      }
      process.stdout.write(`\r✓ Products: ${Math.min(i + batchSize, prods.length)} / ${prods.length}`);
    }
    console.log('\n✓ Products selesai.');
  }

  // 4. Invoices
  if (fs.existsSync(path.join(exportDir, 'invoices.json'))) {
    const invoices = JSON.parse(fs.readFileSync(path.join(exportDir, 'invoices.json'), 'utf8'));
    console.log(`Importing ${invoices.length} invoices...`);
    const invPayload = invoices.map(d => ({
      id: String(d._id),
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
      voucher_code: d.voucherCode || d.voucher_code || null,
      created_at: d.createdAt || d.created_at || new Date().toISOString(),
      updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('invoices').upsert(invPayload);
    if (error) console.error('Error importing invoices:', error);
    else console.log('✓ Invoices selesai.');
  }

  // 5. Reviews
  if (fs.existsSync(path.join(exportDir, 'reviews.json'))) {
    const reviews = JSON.parse(fs.readFileSync(path.join(exportDir, 'reviews.json'), 'utf8'));
    console.log(`Importing ${reviews.length} reviews...`);
    const reviewsPayload = reviews.map(d => ({
      id: String(d._id),
      product_id: String(d.productId || d.product_id || 'unknown'),
      buyer_id: d.buyerId || d.buyer_id || null,
      user_name: d.userName || d.user_name || d.name || 'User',
      user_image: d.userImage || d.user_image || null,
      rating: Number(d.rating || 5),
      comment: d.comment || d.review || null,
      images: d.images || [],
      created_at: d.createdAt || d.created_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('reviews').upsert(reviewsPayload);
    if (error) console.error('Error importing reviews:', error);
    else console.log('✓ Reviews selesai.');
  }

  // 6. Banners
  if (fs.existsSync(path.join(exportDir, 'banners.json'))) {
    const banners = JSON.parse(fs.readFileSync(path.join(exportDir, 'banners.json'), 'utf8'));
    console.log(`Importing ${banners.length} banners...`);
    const bannersPayload = banners.map(d => ({
      id: String(d._id),
      title: d.title || null,
      image: d.image || d.imageUrl || '',
      link: d.link || d.url || null,
      active: d.active !== false,
      order: Number(d.order || 0),
      created_at: d.createdAt || d.created_at || new Date().toISOString(),
      updated_at: d.updatedAt || d.updated_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from('banners').upsert(bannersPayload);
    if (error) console.error('Error importing banners:', error);
    else console.log('✓ Banners selesai.');
  }

  console.log('\n=== SEMUA DATA BERHASIL DIIMPORT KE SUPABASE ===');
}

importAll().catch(console.error);
