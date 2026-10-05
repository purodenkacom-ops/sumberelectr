import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import AreaSelect from '@/components/AreaSelect';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

export default function AddressPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', street: '', area: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !router.isReady) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }

    supabase.from('users').select('*').eq('id', user.id).maybeSingle()
      .then(({ data, error: profileError }) => {
        if (profileError) throw profileError;
        const profile = data?.profile || {};
        setForm({
          name: data?.buyer_name || data?.name || profile.name || user.user_metadata?.name || '',
          phone: data?.phone || profile.phone || '',
          street: data?.street || profile.street || '',
          area: data?.area || profile.area || null,
        });
      })
      .catch(err => setError(err.message || 'Gagal memuat profil.'))
      .finally(() => setLoading(false));
  }, [authLoading, router, router.isReady, user]);

  const saveAddress = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.phone.trim() || !form.street.trim() || !form.area?.id) {
      setError('Lengkapi nama, nomor WhatsApp, alamat jalan, dan pilih area.');
      return;
    }

    setSaving(true);
    try {
      const { data: current, error: readError } = await supabase
        .from('users').select('profile').eq('id', user.id).maybeSingle();
      if (readError) throw readError;

      const areaId = `${form.area.id}IDZ${form.area.postal_code || ''}`;
      const address = [form.street, form.area.name, form.area.city_name, form.area.province, form.area.postal_code]
        .filter(Boolean).join(', ');
      const profile = {
        ...(current?.profile || {}),
        name: form.name.trim(),
        phone: form.phone.trim(),
        street: form.street.trim(),
        address,
        area: { ...form.area, area_id: areaId },
        area_id: areaId,
        district: form.area.name || '',
        city: form.area.city_name || '',
        province: form.area.province || '',
        postal_code: form.area.postal_code || '',
      };

      const { error: saveError } = await supabase.from('users')
        .update({ profile, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (saveError) throw saveError;

      const returnTo = typeof router.query.returnTo === 'string' && router.query.returnTo.startsWith('/')
        ? router.query.returnTo
        : `/cart/${user.id}`;
      router.replace(returnTo);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan alamat.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="min-h-screen grid place-items-center text-sm text-gray-500">Memuat...</div>;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="Purodenka" width={120} height={40} className="mx-auto h-10 w-auto" priority />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Lengkapi Alamat Pengiriman</h1>
          <p className="mt-1 text-sm text-gray-500">Alamat diperlukan sebelum checkout. Data akun yang sudah ada otomatis terisi.</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={saveAddress} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Nama Penerima *
              <input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} className="mt-1 w-full rounded-lg border px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500" />
            </label>
            <label className="text-sm font-medium text-gray-700">Nomor WhatsApp *
              <input type="tel" value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} className="mt-1 w-full rounded-lg border px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500" />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">Alamat Jalan *
            <textarea rows={3} value={form.street} onChange={e => setForm(v => ({ ...v, street: e.target.value }))} placeholder="Jl. Melati No. 9, RT/RW" className="mt-1 w-full rounded-lg border px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500" />
          </label>
          <AreaSelect value={form.area} label="Area / Kecamatan / Kota *" onSelect={area => setForm(v => ({ ...v, area }))} />
          {form.area && <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-700"><strong>{form.area.name}</strong>, {form.area.city_name}, {form.area.province} {form.area.postal_code}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.back()} className="flex-1 rounded-lg border px-4 py-3 text-sm">Kembali</button>
            <button disabled={saving} className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan & Lanjut Checkout'}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
