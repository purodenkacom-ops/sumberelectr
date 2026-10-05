require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function verify() {
  console.log('=== Verifikasi Data di Supabase ===');
  const tables = ['categories', 'products', 'users', 'invoices', 'reviews', 'banners'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Table ${t} error:`, error.message);
    } else {
      console.log(`✓ Table [${t}]: ${count} records`);
    }
  }

  // Smoke test query katalog paged
  const { data: prods, count: prodCount } = await supabase
    .from('products')
    .select('id, name, price_retail, category_slug', { count: 'exact' })
    .range(0, 4);

  console.log(`✓ Sample query 5 products from total ${prodCount}:`);
  console.log(prods);
}

verify().catch(console.error);
