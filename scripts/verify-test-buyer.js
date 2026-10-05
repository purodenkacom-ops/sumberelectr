require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function verifyTestBuyer(email) {
  console.log('🔍 Verify Test Buyer Data\n');
  console.log('Email:', email);
  console.log('═══════════════════════════\n');

  try {
    // 1. Check user exists
    console.log('1. Checking user profile...');
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!userData) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:');
    console.log('   ID:', userData.id);
    console.log('   Name:', userData.profile?.name || 'N/A');
    console.log('   Role:', userData.role);
    console.log('   Created:', userData.created_at);

    const userId = userData.id;

    // 2. Check cart
    console.log('\n2. Checking cart...');
    const { data: cartData } = await supabase
      .from('carts')
      .select('items')
      .eq('user_id', userId)
      .single();

    if (cartData) {
      const items = cartData.items || [];
      console.log('✅ Cart exists:', items.length, 'items');
    } else {
      console.log('⚪ No cart data');
    }

    // 3. Check orders
    console.log('\n3. Checking orders...');
    const { data: orders, count: orderCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('buyer_id', userId);

    console.log('✅ Orders:', orderCount || 0);
    if (orders && orders.length > 0) {
      orders.forEach((order, i) => {
        console.log(`   Order ${i + 1}:`, order.id);
        console.log('     Product:', order.product_name);
        console.log('     Quantity:', order.quantity);
        console.log('     Total:', 'Rp', order.total_price?.toLocaleString('id-ID'));
      });
    }

    // 4. Check invoices
    console.log('\n4. Checking invoices...');
    const { data: invoices, count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .eq('buyer_id', userId);

    console.log('✅ Invoices:', invoiceCount || 0);
    if (invoices && invoices.length > 0) {
      invoices.forEach((inv, i) => {
        console.log(`   Invoice ${i + 1}:`, inv.id);
        console.log('     Status:', inv.status);
        console.log('     Total:', 'Rp', inv.total_amount?.toLocaleString('id-ID'));
        console.log('     Created:', inv.created_at);
        if (inv.shipping_tracking) {
          console.log('     Resi:', inv.shipping_tracking);
        }
      });
    }

    // 5. Check reviews
    console.log('\n5. Checking reviews...');
    const { data: reviews, count: reviewCount } = await supabase
      .from('reviews')
      .select('*', { count: 'exact' })
      .eq('buyer_id', userId);

    console.log('✅ Reviews:', reviewCount || 0);
    if (reviews && reviews.length > 0) {
      reviews.forEach((rev, i) => {
        console.log(`   Review ${i + 1}:`, rev.id);
        console.log('     Product:', rev.product_id);
        console.log('     Rating:', rev.rating, '⭐');
        console.log('     Comment:', rev.comment?.substring(0, 50) + '...');
        console.log('     Created:', rev.created_at);
      });
    }

    console.log('\n═══════════════════════════');
    console.log('✅ Verification complete');
    console.log('\nSummary:');
    console.log('- Cart items:', cartData?.items?.length || 0);
    console.log('- Orders:', orderCount || 0);
    console.log('- Invoices:', invoiceCount || 0);
    console.log('- Reviews:', reviewCount || 0);

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/verify-test-buyer.js <email>');
  console.log('Example: node scripts/verify-test-buyer.js testbuyer@gmail.com');
  process.exit(1);
}

verifyTestBuyer(email);
