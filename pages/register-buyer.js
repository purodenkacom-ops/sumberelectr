import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import AreaSelect from '../components/AreaSelect';
import Link from 'next/link';
import Image from 'next/image';

export default function RegisterBuyerPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({
    name: '',
    street: '',
    phone: '',
    area: null,
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAreaSelect = (area) => {
    setForm({ ...form, area });
  };

  const makeAddress = (street, area) => {
    if (!area) return street;
    const { id, ...areaNoId } = area;
    const addressParts = [
      street,
      areaNoId.name,
      areaNoId.city_name,
      areaNoId.district,
      areaNoId.province,
      areaNoId.postal_code
    ].filter(Boolean);
    return addressParts.join(', ');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.street || !form.phone || !form.area ||
        !form.email || !form.password || !form.confirmPassword) {
      setError('Mohon lengkapi semua data.');
      return;
    }

    if (form.password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Kata sandi tidak cocok.');
      return;
    }

    setLoading(true);

    try {
      const fullAddress = makeAddress(form.street, form.area);
      const extraData = {
        full_name: form.name,
        phone: form.phone,
        address: fullAddress,
        street: form.street,
        area: form.area,
      };

      const res = await signup(form.email, form.password, extraData);
      const authUser = res?.user;

      if (authUser) {
        // Buat record di public.users
        const profileRow = {
          id: authUser.id,
          email: form.email,
          role: 'buyer',
          profile: {
            name: form.name,
            phone: form.phone,
            address: fullAddress,
            street: form.street,
            area: form.area,
          },
          updated_at: new Date().toISOString(),
        };

        await supabase.from('users').upsert(profileRow);
      }

      setSuccess(true);
    } catch (err) {
      console.error('Registration error:', err);
      if (err.message?.includes('User already registered')) {
        setError('Email ini sudah terdaftar. Silakan masuk.');
      } else {
        setError(err.message || 'Gagal mendaftar. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Pendaftaran Berhasil!</h2>
          <p className="text-sm text-gray-600 mb-6">
            Akun Anda telah dibuat. Silakan periksa inbox email Anda untuk verifikasi atau langsung masuk.
          </p>
          <Link
            href="/login"
            className="block w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition text-sm text-center"
          >
            Masuk ke Akun
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-12">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <Image src="/logo.png" alt="Logo" width={120} height={40} className="mx-auto h-10 w-auto" priority />
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">Daftar Akun Baru</h2>
          <p className="text-sm text-gray-500 mt-1">Lengkapi data untuk kemudahan pengiriman pesanan</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nomor WhatsApp *</label>
              <input
                type="tel"
                name="phone"
                required
                value={form.phone}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
                placeholder="08123456789"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
              placeholder="nama@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap / Jalan *</label>
            <textarea
              name="street"
              required
              rows={2}
              value={form.street}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
              placeholder="Jl. Kenari No. 123, RT 01 / RW 02"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Area / Kecamatan / Kota *</label>
            <AreaSelect onSelect={handleAreaSelect} value={form.area} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
                placeholder="Minimal 6 karakter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                required
                value={form.confirmPassword}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 outline-none text-sm"
                placeholder="Ulangi password"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="showPass"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500"
            />
            <label htmlFor="showPass" className="text-xs text-gray-600 cursor-pointer">
              Tampilkan kata sandi
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 text-sm shadow-md"
          >
            {loading ? 'Mendaftarkan Akun...' : 'Daftar Sekarang'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-red-600 hover:text-red-700 font-medium">
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
