// Init sekali firebase-admin (hindari multiple init di dev)
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminApp = null;
let adminDb = null;
let adminAuth = null;

function initFirebaseAdmin() {
  if (adminApp) return { adminApp, adminDb, adminAuth };
  
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
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
      console.warn('[firebaseAdmin] Missing service account env vars - Firebase Admin tidak diinisialisasi');
      return { adminApp: null, adminDb: null, adminAuth: null };
    }

    try {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      adminDb = getFirestore(adminApp);
      adminAuth = getAuth(adminApp);
    } catch (e) {
      console.error('[firebaseAdmin] Init error:', e.message);
      return { adminApp: null, adminDb: null, adminAuth: null };
    }
  } else {
    adminApp = getApps()[0];
    adminDb = getFirestore(adminApp);
    adminAuth = getAuth(adminApp);
  }

  return { adminApp, adminDb, adminAuth };
}

// Init saat module load
const result = initFirebaseAdmin();
adminApp = result.adminApp;
adminDb = result.adminDb;
adminAuth = result.adminAuth;

export { adminApp, adminDb, adminAuth, initFirebaseAdmin };
