require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Testing Supabase REST with:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function run() {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    console.log('Users query result:', { data, error });
  } catch (e) {
    console.error('Catch error:', e);
  }
}
run();
