import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

export default function PleaseVerify() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resendCount, setResendCount] = useState(0);

  useEffect(() => {
    const emailFromQuery = router.query.email;
    if (emailFromQuery) {
      setEmail(emailFromQuery);
    } else if (user?.email) {
      setEmail(user.email);
    }

    if (router.query.sent) {
      setStatus('Email verifikasi telah dikirim.');
    }
  }, [router.query, user]);

  // Restore state dari localStorage saat mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('verifyResendMeta');
      if (raw) {
        const meta = JSON.parse(raw);
        if (meta && typeof meta === 'object') {
          setResendCount(meta.count || 0);
          if (meta.last && meta.cooldown) {
            const elapsed = Math.floor((Date.now() - meta.last) / 1000);
            const remain = meta.cooldown - elapsed;
            if (remain > 0) setCooldown(remain);
          }
        }
      }
    } catch (_) {}
  }, []);

  // Countdown cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const iv = setInterval(() => {
      setCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(iv);
  }, [cooldown]);

  const persistMeta = (count, cdSeconds) => {
    try {
      localStorage.setItem('verifyResendMeta', JSON.stringify({
        count,
        cooldown: cdSeconds,
        last: Date.now()
      }));
    } catch (_) {}
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    const targetEmail = email || user?.email;
    if (!targetEmail) {
      setStatus('Silakan login ulang untuk mengirim ulang verifikasi.');
      return;
    }

    const nextCount = resendCount + 1;
    const baseCd = 60;
    const cdSeconds = nextCount >= 3 ? baseCd * nextCount : baseCd;

    try {
      setStatus('Mengirim...');
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail
      });
      if (error) throw error;

      setResendCount(nextCount);
      setCooldown(cdSeconds);
      persistMeta(nextCount, cdSeconds);
      setStatus('Email verifikasi telah dikirim! Cek inbox (dan folder Spam).');
    } catch (err) {
      setStatus('Gagal mengirim: ' + (err.message || 'Error tidak diketahui'));
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      if (u?.email_confirmed_at) {
        router.push('/account');
      } else {
        setStatus('Email belum diverifikasi. Cek inbox Anda.');
      }
    } catch (e) {
      setStatus('Gagal cek status: ' + e.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="mb-4">
          <svg className="w-16 h-16 mx-auto text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Verifikasi Email Anda</h1>
        <p className="text-gray-500 text-sm mb-4">
          Kami mengirimkan link verifikasi ke{' '}
          <span className="font-semibold text-gray-700">{email || 'email Anda'}</span>.
          Klik link di email untuk mengaktifkan akun.
        </p>

        {status && (
          <div className={`mb-4 text-sm rounded-lg px-4 py-2 ${status.includes('Gagal') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {status}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={cooldown > 0}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {cooldown > 0 ? `Kirim ulang (${cooldown}s)` : 'Kirim Ulang Email'}
          </button>

          <button
            onClick={handleCheckVerified}
            disabled={checking}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {checking ? 'Memeriksa...' : 'Saya Sudah Verifikasi'}
          </button>

          <button
            onClick={() => router.push('/login')}
            className="w-full px-4 py-2 text-sm text-gray-400 hover:text-gray-600 transition"
          >
            Kembali ke Login
          </button>
        </div>
      </div>
    </div>
  );
}
