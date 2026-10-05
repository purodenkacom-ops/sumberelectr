require('dotenv').config();
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createClient } = require('@supabase/supabase-js');

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

console.log('Firebase initialized.');
console.log('Supabase URL:', process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

async function inspectFirebase() {
  const cols = await firestore.listCollections();
  console.log('Available collections:', cols.map(c => c.id));
  for (const c of cols) {
    const snap = await c.count().get();
    console.log(`- ${c.id}: ${snap.data().count} docs`);
  }
}

inspectFirebase().catch(console.error);
