import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { sendPasswordResetEmail, sendEmailVerification, fetchSignInMethodsForEmail, GoogleAuthProvider, EmailAuthProvider, linkWithPopup, linkWithCredential } from 'firebase/auth';
import { auth } from '@/utils/firebase';
import { signInWithGoogle, firestore } from '@/utils/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // State untuk popup lupa password
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      // If currently anonymous, try to LINK to keep UID and merge data
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        try {
          const cred = EmailAuthProvider.credential(form.email, form.password);
          const linkRes = await linkWithCredential(auth.currentUser, cred);
          user = linkRes.user;
        } catch (linkErr) {
          // If email already in use, fall back to normal sign-in (UID will change; merging would need migration)
          const userCredential = await login(form.email, form.password);
          user = userCredential.user || userCredential;
        }
      } else {
        const userCredential = await login(form.email, form.password);
        user = userCredential.user || userCredential;
      }

      // Reload agar status emailVerified paling baru
      try { await user.reload(); } catch (_) {}

      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      if (!user.emailVerified || (userData && userData.emailVerified === false && !user.emailVerified)) {
        try { await sendEmailVerification(user); } catch (_) {}
        await auth.signOut();
        return router.push(`/please-verify?email=${encodeURIComponent(user.email)}&unverified=1`);
      }

      // Sinkronisasi ke Firestore bila sudah verified
      if (userData && userData.emailVerified === false && user.emailVerified) {
        try { await updateDoc(userRef, { emailVerified: true }); } catch (_) {}
      }

      if (userData) {
        const role = userData.role;
        if (role === 'admin') return router.push('/admin/dashboard');
        return router.push('/');
      } else {
        setError('Akun tidak ditemukan.');
      }
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      let user;
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        const provider = new GoogleAuthProvider();
        const linkRes = await linkWithPopup(auth.currentUser, provider);
        user = linkRes.user;
      } else {
        const userCredential = await signInWithGoogle();
        user = userCredential.user || userCredential;
      }

      try { await user.reload(); } catch (_) {}

      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      if (!user.emailVerified || (userData && userData.emailVerified === false && !user.emailVerified)) {
        try { await sendEmailVerification(user); } catch (_) {}
        await auth.signOut();
        return router.push(`/please-verify?email=${encodeURIComponent(user.email)}&unverified=1`);
      }

      if (userData && userData.emailVerified === false && user.emailVerified) {
        try { await updateDoc(userRef, { emailVerified: true }); } catch (_) {}
      }

      if (userData) {
        const role = userData.role;
        if (role === 'admin') return router.push('/admin/dashboard');
        return router.push('/');
      } else {
        // Jika user belum punya doc → arahkan registrasi (atau buat doc baru di sini)
        return router.push('/register');
      }
    } catch (err) {
      setError('Google login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg('');
    setResetError('');

    if (!resetEmail) {
      setResetError('Masukkan email untuk reset password.');
      return;
    }

    try {
      // Cek metode sign-in (lebih akurat daripada query koleksi users)
      const methods = await fetchSignInMethodsForEmail(auth, resetEmail);
      if (!methods || methods.length === 0) {
        setResetError('Email tidak terdaftar.');
        return;
      }
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMsg('Link reset password telah dikirim. Periksa inbox Anda.');
    } catch (err) {
      setResetError('Gagal mengirim email reset password.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md p-8 rounded-2xl shadow-2xl border border-red-100 bg-white/80 backdrop-blur-sm">
        <h1 className="text-3xl font-extrabold text-center text-primary mb-8 tracking-tight">
          Sign in to <span className="text-dark">Purodenka</span>
        </h1>

        {error && (
          <div className="bg-red-100 text-red-700 text-[15px] p-3 mb-5 rounded-lg border border-red-200 flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z" /></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <label htmlFor="email" className="block mb-1 text-sm font-medium text-dark">
              Email
            </label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-base transition"
              placeholder="you@email.com"
            />
          </div>

          <div className="relative">
            <label htmlFor="password" className="block mb-1 text-sm font-medium text-dark">
              Password
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-base transition"
              placeholder="••••••••"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="text-primary text-sm hover:underline"
              onClick={() => setShowReset(true)}
            >
              Lupa Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-70 disabled:cursor-not-allowed shadow-md`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Divider with "or" */}
        <div className="flex items-center my-6">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-4 text-gray-400 font-semibold text-xs uppercase">or</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white border border-gray-200 text-dark py-2.5 rounded-lg flex items-center justify-center gap-3 font-semibold hover:shadow-lg transition shadow-md"
        >
          <Image src="/images/google.svg" alt="Google" width={20} height={20} className="w-5 h-5" />
          Sign in with Google
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register-buyer" className="text-primary hover:underline font-medium">
            Register here
          </Link>
        </p>
      </div>

      {/* Popup Lupa Password */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl"
              onClick={() => {
                setShowReset(false);
                setResetEmail('');
                setResetMsg('');
                setResetError('');
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2 className="text-lg font-bold mb-4 text-primary">Reset Password</h2>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="Masukkan email Anda"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="submit"
                className="w-full bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition"
              >
                Kirim Link Reset
              </button>
            </form>
            {resetMsg && (
              <div className="text-green-600 text-sm mt-2">{resetMsg}</div>
            )}
            {resetError && (
              <div className="text-red-600 text-sm mt-2">{resetError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}