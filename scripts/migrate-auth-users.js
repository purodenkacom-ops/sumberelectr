require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { createClient } = require('@supabase/supabase-js');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  })
});
const fbAuth = getAuth(app);
const db = getFirestore(app);

const sbAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function migrateAuthUsers() {
  console.log('Fetching Firebase Auth users...');
  const list = await fbAuth.listUsers(1000);
  console.log(`Found ${list.users.length} users in Firebase Auth.`);

  for (const u of list.users) {
    const email = u.email;
    if (!email) continue;

    const doc = await db.collection('users').doc(u.uid).get();
    const fsData = doc.data() || {};
    const role = fsData.role || (email.includes('admin') ? 'admin' : 'buyer');

    console.log(`\nProcessing: ${email} (role: ${role})...`);

    // 1. Create in Supabase Auth (let Supabase generate UUID)
    let sbAuthUserId = null;
    const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true,
      user_metadata: {
        full_name: u.displayName || fsData.profile?.name || fsData.name || email.split('@')[0],
        phone: u.phoneNumber || fsData.profile?.phone || fsData.phone || '',
        avatar_url: u.photoURL || fsData.profile?.avatar || '',
        firebase_uid: u.uid,
      },
    });

    if (createErr) {
      if (createErr.message.includes('already exists') || createErr.message.includes('unique')) {
        console.log(`  Already in Supabase Auth.`);
        // Ambil existing id
        const { data: existingList } = await sbAdmin.auth.admin.listUsers();
        const existing = existingList.users.find(x => x.email === email);
        if (existing) sbAuthUserId = existing.id;
      } else {
        console.error(`  Error creating auth user:`, createErr.message);
      }
    } else {
      sbAuthUserId = created.user.id;
      console.log(`  Created in Supabase Auth (id: ${sbAuthUserId})`);
    }

    // 2. Upsert ke public.users dengan ID baru Supabase Auth (dan tetap simpan ID lama juga untuk referensi)
    if (sbAuthUserId) {
      const profileRow = {
        id: sbAuthUserId,
        email: email,
        role: role,
        profile: {
          name: u.displayName || fsData.profile?.name || fsData.name || email.split('@')[0],
          phone: u.phoneNumber || fsData.profile?.phone || fsData.phone || '',
          avatar: u.photoURL || fsData.profile?.avatar || '',
          address: fsData.profile?.address || fsData.address || '',
          firebase_uid: u.uid,
        },
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await sbAdmin
        .from('users')
        .upsert(profileRow, { onConflict: 'id' });

      if (upsertErr) console.error(`  Error upserting public.users:`, upsertErr.message);
      else console.log(`  Upserted public.users (id: ${sbAuthUserId}, role: ${role})`);
    }
  }

  console.log('\n--- Final Supabase Auth Users ---');
  const { data: finalAuth } = await sbAdmin.auth.admin.listUsers();
  console.table(finalAuth.users.map(u => ({ id: u.id, email: u.email, confirmed: u.email_confirmed_at ? 'YES' : 'NO' })));

  console.log('\n--- Final public.users table ---');
  const { data: allUsers } = await sbAdmin.from('users').select('*');
  console.table(allUsers.map(u => ({ id: u.id, email: u.email, role: u.role, name: u.profile?.name })));
}

migrateAuthUsers().catch(console.error);
