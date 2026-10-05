import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '@/utils/supabase';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  const { login, loginWithGoogle, user, role, loading: authLoading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // State untuk popup lupa password
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');

  // Auto redirect jika user sudah dalam keadaan login
  useEffect(() => {
    if (!authLoading && user) {
      if (role === 'admin') {
        router.replace('/admin/dashboard');
      } else {
        const redirect = localStorage.getItem('redirectAfterLogin');
        if (redirect) {
          localStorage.removeItem('redirectAfterLogin');
          router.replace(redirect);
        } else {
          router.replace('/account');
        }
      }
    }
  }, [user, role, authLoading, router]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form.email, form.password);
      const authUser = res?.user;

      if (!authUser) {
        setError('Invalid email or password');
        return;
      }

      // Ambil role yang sudah disinkronkan
      const userRole = res.fullUser?.role || 'buyer';

      // Route guard redirect
      if (userRole === 'admin') {
        router.push('/admin/dashboard');
      } else {
        const redirect = localStorage.getItem('redirectAfterLogin');
        if (redirect) {
          localStorage.removeItem('redirectAfterLogin');
          router.push(redirect);
        } else {
          router.push('/account');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.message?.includes('Email not confirmed')) {
        setError('Email belum dikonfirmasi. Periksa inbox Anda.');
      } else {
        setError('Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
      setError('Google login failed.');
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
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${siteUrl}/account/reset-password`,
      });
      if (error) throw error;
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
