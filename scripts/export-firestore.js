require('dotenv').config();
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
privateKey = privateKey.replace(/\\n/g, '\n');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
}

const firestore = getFirestore();

function toPlainValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toPlainValue);
  if (typeof v === 'object') {
    const res = {};
    for (const key of Object.keys(v)) {
      res[key] = toPlainValue(v[key]);
    }
    return res;
  }
  return v;
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number') return String(str);
  if (typeof str === 'boolean') return str ? 'TRUE' : 'FALSE';
  if (typeof str === 'object') {
    return `'${JSON.stringify(str).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function exportAll() {
  const exportDir = path.join(__dirname, '../data-migration');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const collections = [
    'users',
    'categories',
    'products',
    'carts',
    'invoices',
    'reviews',
    'banners',
    'settings',
    'webhooks_logs',
  ];

  console.log('Starting Firestore export...');

  for (const colName of collections) {
    const snap = await firestore.collection(colName).get();
    const docs = snap.docs.map(doc => ({
      _id: doc.id,
      ...toPlainValue(doc.data())
    }));

    const jsonPath = path.join(exportDir, `${colName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(docs, null, 2), 'utf8');
    console.log(`✓ Exported ${docs.length} docs from ${colName} -> ${jsonPath}`);
  }

  console.log('Generating full migration SQL script...');

  let sql = `-- Migration Data Dump from Firebase\n\n`;

  // 1. Categories
  const categoriesDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'categories.json'), 'utf8'));
  if (categoriesDocs.length > 0) {
    sql += `-- Categories (${categoriesDocs.length})\n`;
    for (const d of categoriesDocs) {
      const name = d.name || d._id;
      const slug = (d.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || d._id;
      sql += `INSERT INTO public.categories (id, name, slug, parent_id, banner, metadata, created_at, updated_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(name)}, ${escapeSql(slug)}, ${escapeSql(d.parentId || d.parent_id)}, ${escapeSql(d.banner)}, ${escapeSql(d)}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())}, ${escapeSql(d.updatedAt || d.updated_at || new Date().toISOString())})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, parent_id = EXCLUDED.parent_id, banner = EXCLUDED.banner;\n`;
    }
    sql += `\n`;
  }

  // 2. Users
  const usersDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'users.json'), 'utf8'));
  if (usersDocs.length > 0) {
    sql += `-- Users (${usersDocs.length})\n`;
    for (const d of usersDocs) {
      sql += `INSERT INTO public.users (id, firebase_uid, email, role, profile, created_at, updated_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(d._id)}, ${escapeSql(d.email)}, ${escapeSql(d.role || 'buyer')}, ${escapeSql(d.profile || d)}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())}, ${escapeSql(d.updatedAt || d.updated_at || new Date().toISOString())})
ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 3. Products
  const productsDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'products.json'), 'utf8'));
  if (productsDocs.length > 0) {
    sql += `-- Products (${productsDocs.length})\n`;
    for (const d of productsDocs) {
      const name = d.name || 'Produk';
      const slug = (d.slug || d.productSlug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || d._id;
      const categorySlug = (d.categorySlug || d.category || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const subCategorySlug = (d.subCategorySlug || d.subCategory || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
      const images = Array.isArray(d.images) ? d.images : d.image ? [d.image] : [];
      const image = d.image || images[0] || '';
      const price = Number(d.price || d.priceRetail || 0);
      const priceRetail = Number(d.priceRetail || price || 0);
      const priceWholesale = Number(d.priceWholesale || price || 0);
      const weight = Number(d.weight || 500);

      sql += `INSERT INTO public.products (id, name, slug, product_slug, permalink, category, category_slug, sub_category, sub_category_slug, description, image, images, price, price_retail, price_wholesale, min_wholesale, discount, weight, stock, sold, sales_count, rating, review_count, size_variants, specifications, metadata, created_at, updated_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(name)}, ${escapeSql(slug)}, ${escapeSql(d.productSlug || slug)}, ${escapeSql(d.permalink || slug)}, ${escapeSql(d.category)}, ${escapeSql(categorySlug)}, ${escapeSql(d.subCategory)}, ${escapeSql(subCategorySlug)}, ${escapeSql(d.description)}, ${escapeSql(image)}, ${escapeSql(images)}, ${price}, ${priceRetail}, ${priceWholesale}, ${d.minWholesale || 1}, ${d.discount || 0}, ${weight}, ${d.stock || 0}, ${d.sold || 0}, ${d.salesCount || 0}, ${d.rating || 0}, ${d.reviewCount || 0}, ${escapeSql(d.sizeVariants || [])}, ${escapeSql(d.specifications || {})}, ${escapeSql(d)}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())}, ${escapeSql(d.updatedAt || d.updated_at || new Date().toISOString())})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_retail = EXCLUDED.price_retail, stock = EXCLUDED.stock, weight = EXCLUDED.weight;\n`;
    }
    sql += `\n`;
  }

  // 4. Invoices
  const invoicesDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'invoices.json'), 'utf8'));
  if (invoicesDocs.length > 0) {
    sql += `-- Invoices (${invoicesDocs.length})\n`;
    for (const d of invoicesDocs) {
      sql += `INSERT INTO public.invoices (id, buyer_id, buyer_name, buyer_email, buyer_phone, guest_uid, guest_session_id, status, payment_method, payment_gateway, items, subtotal, shipping_cost, discount_amount, grand_total, shipping_address, shipping_selection, biteship, midtrans, xendit, voucher_code, created_at, updated_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(d.buyerId || d.buyer_id)}, ${escapeSql(d.buyerName || d.buyer_name)}, ${escapeSql(d.buyerEmail || d.buyer_email)}, ${escapeSql(d.buyerPhone || d.buyer_phone)}, ${escapeSql(d.guestUid || d.guest_uid)}, ${escapeSql(d.guestSessionId || d.guest_session_id)}, ${escapeSql(d.status || 'draft')}, ${escapeSql(d.paymentMethod || d.payment_method)}, ${escapeSql(d.paymentGateway || d.payment_gateway)}, ${escapeSql(d.items || [])}, ${Number(d.subtotal || 0)}, ${Number(d.shippingCost || d.shipping_cost || 0)}, ${Number(d.discountAmount || d.discount_amount || 0)}, ${Number(d.grandTotal || d.grand_total || 0)}, ${escapeSql(d.shippingAddress || d.shipping_address || {})}, ${escapeSql(d.shippingSelection || d.shipping_selection || {})}, ${escapeSql(d.biteship || {})}, ${escapeSql(d.midtrans || {})}, ${escapeSql(d.xendit || {})}, ${escapeSql(d.voucherCode || d.voucher_code)}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())}, ${escapeSql(d.updatedAt || d.updated_at || new Date().toISOString())})
ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 5. Reviews
  const reviewsDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'reviews.json'), 'utf8'));
  if (reviewsDocs.length > 0) {
    sql += `-- Reviews (${reviewsDocs.length})\n`;
    for (const d of reviewsDocs) {
      sql += `INSERT INTO public.reviews (id, product_id, buyer_id, user_name, user_image, rating, comment, images, created_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(d.productId || d.product_id || 'unknown')}, ${escapeSql(d.buyerId || d.buyer_id)}, ${escapeSql(d.userName || d.user_name || d.name || 'User')}, ${escapeSql(d.userImage || d.user_image)}, ${Number(d.rating || 5)}, ${escapeSql(d.comment || d.review)}, ${escapeSql(d.images || [])}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())})
ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  // 6. Banners
  const bannersDocs = JSON.parse(fs.readFileSync(path.join(exportDir, 'banners.json'), 'utf8'));
  if (bannersDocs.length > 0) {
    sql += `-- Banners (${bannersDocs.length})\n`;
    for (const d of bannersDocs) {
      sql += `INSERT INTO public.banners (id, title, image, link, active, "order", created_at, updated_at)
VALUES (${escapeSql(d._id)}, ${escapeSql(d.title)}, ${escapeSql(d.image || d.imageUrl || '')}, ${escapeSql(d.link || d.url)}, ${d.active !== false}, ${Number(d.order || 0)}, ${escapeSql(d.createdAt || d.created_at || new Date().toISOString())}, ${escapeSql(d.updatedAt || d.updated_at || new Date().toISOString())})
ON CONFLICT (id) DO NOTHING;\n`;
    }
    sql += `\n`;
  }

  const sqlPath = path.join(exportDir, 'import_data.sql');
  fs.writeFileSync(sqlPath, sql, 'utf8');
  console.log(`✓ Generated ${sqlPath} (${(fs.statSync(sqlPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

exportAll().catch(console.error);
