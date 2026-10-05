import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/utils/supabase';
import AreaSelect from '../components/AreaSelect';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    street: '',
    phone: '',
    area: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAreaSelect = (area) => {
    setForm({ ...form, area });
  };

  // Helper untuk bikin address dari street + area
  const makeAddress = (street, area) => {
    if (!area) return street;
    // area tanpa id
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

  // Buat area tanpa id
  const areaWithoutId = (area) => {
    if (!area) return null;
    const { id, ...rest } = area;
    return rest;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!form.name || !form.street || !form.phone || !form.area) {
      setError('Mohon lengkapi semua data.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    try {
      const { error } = await supabase.from('users').upsert({
        id: user.id,
        buyer_name: form.name,
        phone: form.phone,
        street: form.street,
        role: 'buyer',
        email: user.email,
        profile_picture: user.user_metadata?.avatar_url || '',
        area_id: form.area?.id + 'IDZ' + form.area?.postal_code || '',
        province: form.area?.province || '',
        city: form.area?.city_name || '',
        district: form.area?.name || '',
        postal_code: form.area?.postal_code || '',
        address: makeAddress(form.street, form.area),
        area: areaWithoutId(form.area),
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
      router.push('/');
    } catch (err) {
      console.error('Error during registration:', err);
      setError('Registrasi gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-lg bg-white border border-red-100 rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">
          Lengkapi Pendaftaran Anda
        </h1>
        {error && (
          <div className="bg-red-100 text-red-700 text-sm p-3 mb-4 rounded border border-red-200">
            🛑 {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-dark mb-1">Nama Lengkap</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-dark mb-1">Alamat Jalan</label>
            <input
              type="text"
              name="street"
              value={form.street}
              onChange={handleChange}
              required
              placeholder="Contoh: Jl. Melati No.9B"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <AreaSelect label="Pilih Kecamatan / Kota" onSelect={handleAreaSelect} />

          {form.area && (
            <div className="grid grid-cols-2 gap-3 bg-gray-100 text-sm text-gray-700 border border-gray-300 p-3 rounded-md mt-2">
              <div>
                <span className="block font-medium">Provinsi</span>
                <span>{form.area.province}</span>
              </div>
              <div>
                <span className="block font-medium">Kota/Kabupaten</span>
                <span>{form.area.city_name}</span>
              </div>
              <div>
                <span className="block font-medium">Kecamatan</span>
                <span>{form.area.name}</span>
              </div>
              <div>
                <span className="block font-medium">Kodepos</span>
                <span>{form.area.postal_code}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-dark mb-1">No. HP / WhatsApp</label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={!form.name || !form.street || !form.phone || !form.area}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Mendaftarkan...' : 'Daftar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}