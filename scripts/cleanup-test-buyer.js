require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function cleanupTestBuyer(email) {
  console.log('🧹 Cleanup Test Buyer Data\n');
  console.log('Email:', email);
  console.log('═══════════════════════════\n');

  try {
    // 1. Get user ID from email
    console.log('1. Finding user...');
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (!userData) {
      console.log('❌ User not found with email:', email);
      process.exit(1);
    }

    const userId = userData.id;
    console.log('✅ User found:', userId);

    // 2. Delete reviews
    console.log('\n2. Deleting reviews...');
    const { error: reviewError, count: reviewCount } = await supabase
      .from('reviews')
      .delete()
      .eq('buyer_id', userId);

    if (reviewError) {
      console.log('⚠️  Review delete error:', reviewError.message);
    } else {
      console.log('✅ Reviews deleted:', reviewCount || 0);
    }

    // 3. Delete orders
    console.log('\n3. Deleting orders...');
    const { error: orderError, count: orderCount } = await supabase
      .from('orders')
      .delete()
      .eq('buyer_id', userId);

    if (orderError) {
      console.log('⚠️  Order delete error:', orderError.message);
    } else {
      console.log('✅ Orders deleted:', orderCount || 0);
    }

    // 4. Delete invoices
    console.log('\n4. Deleting invoices...');
    const { error: invoiceError, count: invoiceCount } = await supabase
      .from('invoices')
      .delete()
      .eq('buyer_id', userId);

    if (invoiceError) {
      console.log('⚠️  Invoice delete error:', invoiceError.message);
    } else {
      console.log('✅ Invoices deleted:', invoiceCount || 0);
    }

    // 5. Delete cart
    console.log('\n5. Deleting cart...');
    const { error: cartError } = await supabase
      .from('carts')
      .delete()
      .eq('user_id', userId);

    if (cartError) {
      console.log('⚠️  Cart delete error:', cartError.message);
    } else {
      console.log('✅ Cart deleted');
    }

    // 6. Delete user profile
    console.log('\n6. Deleting user profile...');
    const { error: profileError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.log('⚠️  Profile delete error:', profileError.message);
    } else {
      console.log('✅ Profile deleted');
    }

    // 7. Delete auth user
    console.log('\n7. Deleting auth user...');
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError) {
      console.log('⚠️  Auth delete error:', authError.message);
    } else {
      console.log('✅ Auth user deleted');
    }

    console.log('\n✅ Cleanup complete!');
    console.log('═══════════════════════════');
    console.log('Test buyer data removed from database.');

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/cleanup-test-buyer.js <email>');
  console.log('Example: node scripts/cleanup-test-buyer.js testbuyer@gmail.com');
  process.exit(1);
}

cleanupTestBuyer(email);
