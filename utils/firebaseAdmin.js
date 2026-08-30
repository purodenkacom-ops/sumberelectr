// Init sekali firebase-admin (hindari multiple init di dev)
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';

let adminApp;
if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL ;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;

  // Private key biasanya butuh replace \n
  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[firebaseAdmin] Missing service account env vars:', {
      projectId: !!projectId,
      clientEmail: !!clientEmail,
      privateKey: !!privateKey
    });
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
} else {
  adminApp = getApps()[0];
}

const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

// Removed redundant admin.initializeApp since adminApp is already initialized above.
export { adminApp, adminDb, adminAuth };
