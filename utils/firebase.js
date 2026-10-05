// utils/firebase.js - STUB ONLY
// Firebase env vars removed. All queries migrated to Supabase.
// Exports preserved as null to prevent import errors from any remaining references.

export const app = null;
export const auth = null;
export const firestore = null;
export const storage = null;
export const db = null;

export const doc = () => null;
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) });
export const setDoc = () => Promise.resolve();
export const signOut = () => Promise.resolve();
export const signInWithPopup = () => Promise.resolve();
export const createUserWithEmailAndPassword = () => Promise.resolve();
export const signInWithGoogle = () => { throw new Error('Firebase removed. Use Supabase Auth.'); };
export const getFirebaseApp = () => null;
export const getFirebaseAuth = () => null;
export const getFirebaseFirestore = () => null;
export const getFirebaseStorage = () => null;