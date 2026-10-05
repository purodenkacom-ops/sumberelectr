require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const args = new Set(process.argv.slice(2));
const fileArg = process.argv.find((arg) => arg.toLowerCase().endsWith('.xlsx'));
const apply = args.has('--apply');
const deleteMissing = args.has('--delete-missing');
if (!fileArg) throw new Error('Usage: node scripts/sync-products-from-excel.js <file.xlsx> [--apply --delete-missing]');
if (deleteMissing && !apply) throw new Error('--delete-missing requires --apply');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Client-Info': 'product-excel-sync/1.0' } },
});

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const slugify = (value) => normalize(value)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const text = (value) => String(value ?? '').trim();
const number = (value, field, row) => {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Row ${row}: ${field} must be a non-negative number`);
  return parsed;
};
const stableId = (name) => `excel-${crypto.createHash('sha256').update(normalize(name)).digest('hex').slice(0, 24)}`;
const chunks = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

async function fetchAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

function parseExcel(filename) {
  const workbook = XLSX.readFile(filename, { cellDates: false });
  const sheet = workbook.Sheets.Produk || workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (!rows.length) throw new Error('Excel has no product rows');
  const required = ['Product Name', 'Category', 'Price', 'Stock', 'SKU', 'Product Image 1'];
  for (const column of required) if (!(column in rows[0])) throw new Error(`Missing Excel column: ${column}`);

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const name = text(row['Product Name']);
    const category = text(row.Category);
    if (!name) throw new Error(`Row ${rowNumber}: Product Name is required`);
    if (!category) throw new Error(`Row ${rowNumber}: Category is required`);
    const images = ['Product Image 1', 'Product Image 2', 'Product Image 3'].map((key) => text(row[key])).filter(Boolean);
    if (!images.length) throw new Error(`Row ${rowNumber}: at least one image is required`);
    for (const image of images) {
      let url;
      try { url = new URL(image); } catch { throw new Error(`Row ${rowNumber}: invalid image URL`); }
      if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') throw new Error(`Row ${rowNumber}: image must be a Cloudinary HTTPS URL`);
    }
    return {
      rowNumber,
      name,
      key: normalize(name),
      slug: slugify(name),
      category,
      categoryKey: normalize(category),
      subCategory: text(row['Sub Category']),
      description: text(row['Long Description']),
      shortDescription: text(row['short description']),
      price: number(row.Price, 'Price', rowNumber),
      stock: number(row.Stock, 'Stock', rowNumber),
      sku: text(row.SKU),
      weight: number(row['Package Weight'], 'Package Weight', rowNumber),
      currency: text(row.Currency) || 'IDR',
      images,
    };
  });
}

function duplicates(items, key) {
  const seen = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (!seen.has(value)) seen.set(value, []);
    seen.get(value).push(item.rowNumber);
  }
  return [...seen].filter(([, rows]) => rows.length > 1).map(([value, rows]) => ({ value, rows }));
}

async function writeBackup(products, categories) {
  const dir = path.resolve('data-migration', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(dir, `products-before-excel-sync-${stamp}.json`);
  fs.writeFileSync(filename, JSON.stringify({ createdAt: new Date().toISOString(), products, categories }, null, 2));
  return filename;
}

(async () => {
  const excel = parseExcel(path.resolve(fileArg));
  const duplicateNames = duplicates(excel, 'key');
  if (duplicateNames.length) {
    throw new Error(`Excel identity conflict: ${duplicateNames.length} duplicate normalized names`);
  }
  const slugGroups = new Map();
  for (const item of excel) {
    if (!slugGroups.has(item.slug)) slugGroups.set(item.slug, []);
    slugGroups.get(item.slug).push(item);
  }
  for (const group of slugGroups.values()) {
    if (group.length < 2) continue;
    for (const item of group) item.slug = `${item.slug}-${crypto.createHash('sha256').update(item.key).digest('hex').slice(0, 8)}`;
  }
  const duplicateSlugs = duplicates(excel, 'slug');
  if (duplicateSlugs.length) throw new Error(`Excel identity conflict: ${duplicateSlugs.length} duplicate slugs after disambiguation`);

  const [existing, categories] = await Promise.all([
    fetchAll('products', '*'),
    fetchAll('categories', 'id,name,slug,parent_id'),
  ]);
  const existingByName = new Map();
  for (const product of existing) {
    const key = normalize(product.name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key).push(product);
  }
  const ambiguousExisting = [...existingByName].filter(([, rows]) => rows.length > 1);
  if (ambiguousExisting.length) throw new Error(`Database has ${ambiguousExisting.length} duplicate normalized product names; aborting before changes`);

  const rootCategories = new Map(categories.filter((c) => !c.parent_id).map((c) => [normalize(c.name), c]));
  const childCategories = new Map();
  for (const category of categories.filter((c) => c.parent_id)) {
    childCategories.set(`${category.parent_id}:${normalize(category.name)}`, category);
  }
  const missingCategories = [];
  const newSubcategories = new Map();
  for (const item of excel) {
    const category = rootCategories.get(item.categoryKey);
    if (!category) missingCategories.push({ row: item.rowNumber, value: item.category });
    else if (item.subCategory && !childCategories.has(`${category.id}:${normalize(item.subCategory)}`)) {
      const key = `${category.id}:${normalize(item.subCategory)}`;
      if (!newSubcategories.has(key)) {
        newSubcategories.set(key, {
          id: `excel-category-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 20)}`,
          name: item.subCategory,
          slug: slugify(item.subCategory),
          parent_id: category.id,
          metadata: { source: 'excel-product-list' },
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
  if (missingCategories.length) {
    fs.writeFileSync('product-sync-category-errors.json', JSON.stringify({ missingCategories }, null, 2));
    throw new Error(`Category mapping failed: ${missingCategories.length} root categories missing; see product-sync-category-errors.json`);
  }
  for (const [key, category] of newSubcategories) childCategories.set(key, category);

  const desired = excel.map((item) => {
    const old = existingByName.get(item.key)?.[0];
    const category = rootCategories.get(item.categoryKey);
    const subcategory = item.subCategory ? childCategories.get(`${category.id}:${normalize(item.subCategory)}`) : null;
    return {
      ...(old || {}),
      id: old?.id || stableId(item.name),
      name: item.name,
      slug: item.slug,
      product_slug: item.slug,
      permalink: item.slug,
      category_id: category.id,
      category: category.name,
      category_slug: category.slug,
      sub_category: subcategory?.name || null,
      sub_category_slug: subcategory?.slug || null,
      description: item.description,
      image: item.images[0],
      images: item.images,
      price: item.price,
      price_retail: item.price,
      price_wholesale: old?.price_wholesale ?? item.price,
      weight: item.weight ?? old?.weight ?? 0,
      stock: Math.trunc(item.stock),
      metadata: {
        ...(old?.metadata || {}),
        sku: item.sku,
        currency: item.currency,
        short_description: item.shortDescription,
        source: 'excel-product-list',
      },
      updated_at: new Date().toISOString(),
      created_at: old?.created_at || new Date().toISOString(),
    };
  });
  const desiredIds = new Set(desired.map((item) => item.id));
  const obsolete = existing.filter((item) => !desiredIds.has(item.id));
  const matched = desired.filter((item) => existingByName.has(normalize(item.name))).length;
  const skuDuplicates = duplicates(excel, 'sku');
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    excel: excel.length,
    databaseBefore: existing.length,
    matched,
    insert: desired.length - matched,
    update: matched,
    delete: obsolete.length,
    databaseAfter: desired.length,
    duplicateNames: duplicateNames.length,
    duplicateSlugs: duplicateSlugs.length,
    duplicateSkus: skuDuplicates.length,
    newSubcategories: newSubcategories.size,
    blankWeights: excel.filter((item) => item.weight == null).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync('product-sync-plan.json', JSON.stringify({ summary, skuDuplicates, obsolete: obsolete.map(({ id, name }) => ({ id, name })) }, null, 2));
  if (!apply) return;

  const backup = await writeBackup(existing, categories);
  console.log(`Backup: ${backup}`);
  if (newSubcategories.size) {
    const { error } = await supabase.from('categories').upsert([...newSubcategories.values()], { onConflict: 'id' });
    if (error) throw new Error(`Category upsert failed: ${error.message}`);
  }
  for (const batch of chunks(desired, 100)) {
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  }
  if (deleteMissing) {
    for (const batch of chunks(obsolete.map((item) => item.id), 100)) {
      const { error } = await supabase.from('products').delete().in('id', batch);
      if (error) throw new Error(`Delete failed: ${error.message}`);
    }
  }

  const after = await fetchAll('products', 'id,name,slug,product_slug,category,sub_category,price,stock,weight,image,images,metadata');
  const afterNames = new Set(after.map((item) => normalize(item.name)));
  const missingAfter = excel.filter((item) => !afterNames.has(item.key));
  const duplicateAfter = [...after.reduce((map, item) => {
    const key = normalize(item.name);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())].filter(([, count]) => count > 1);
  if (missingAfter.length || duplicateAfter.length || (deleteMissing && after.length !== desired.length)) {
    throw new Error(`Post-apply verification failed: count=${after.length}, missing=${missingAfter.length}, duplicates=${duplicateAfter.length}`);
  }
  console.log(JSON.stringify({ verified: true, products: after.length, missing: 0, duplicateNames: 0 }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
