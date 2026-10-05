require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function migrate() {
  console.log('Running settings table migration...');
  
  // Drop old table
  const { error: dropError } = await supabase.rpc('exec_sql', {
    sql: 'DROP TABLE IF EXISTS public.settings CASCADE;'
  });
  
  if (dropError && !dropError.message.includes('does not exist')) {
    console.error('Drop failed:', dropError);
  }
  
  // Create new table via REST API direct insert won't work
  // Must use SQL Editor in Supabase Dashboard
  
  console.log('\n⚠️  Manual migration required:');
  console.log('\n1. Open Supabase SQL Editor:');
  console.log('   https://vyvxamqfaijgmkiraiza.supabase.co/project/_/sql');
  console.log('\n2. Copy-paste SQL from: migrations/002_settings_table.sql');
  console.log('\n3. Run the migration\n');
  
  process.exit(0);
}

migrate();
