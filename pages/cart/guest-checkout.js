import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { loadGuestCart, removeGuestItem } from '@/utils/guestCart';
import AreaSelect from '@/components/AreaSelect';
import { generateInvoiceId } from '@/utils/invoice';

export default function GuestCheckout() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    buyerName: '',
    phone: '',
    email: '',
    street: '',
    area: null
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const selRaw = sessionStorage.getItem('guest_checkout_selection');
      const selection = selRaw ? JSON.parse(selRaw) : null;
      const { items: all } = loadGuestCart();
      let selected = [];
      if (Array.isArray(selection) && selection.length) {
        const map = new Set(selection.map(x => `${x.productId}|${x.variantLabel||''}`));
        selected = all.filter(it => map.has(`${it.productId}|${it.variantLabel||''}`));
      } else {
        selected = all;
      }
      setItems(selected || []);
    } catch {
      const { items: all } = loadGuestCart();
      setItems(all || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight)||0) * (Number(i.quantity)||1), 0);
  const subtotal = items.reduce((s, i) => s + (Number(i.price)||0) * (Number(i.quantity)||1), 0);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAreaSelect = (area) => {
    setForm({ ...form, area });
  };

  const handleCreateInvoice = async () => {
    if (!items.length) {
      alert('Tidak ada item dipilih.');
      router.push('/cart/guest');
      return;
    }
    if (!form.buyerName.trim()) { alert('Nama wajib diisi.'); return; }
    if (!form.phone.trim()) { alert('Nomor HP wajib diisi.'); return; }
    if (!form.street.trim()) { alert('Alamat jalan wajib diisi.'); return; }
    if (!form.area || !form.area.id) { alert('Pilih area pengiriman.'); return; }

    const shippingAddress = {
      receiver_name: form.buyerName.trim(),
      phone: form.phone.trim(),
      address: [
        form.street.trim(),
        form.area.name,
        form.area.city_name,
        form.area.province
      ].filter(Boolean).join(', ') + (form.area.postal_code ? ` ${form.area.postal_code}` : ''),
      city: form.area.city_name || '',
      province: form.area.province || '',
      district: form.area.name || '',
      postal_code: form.area.postal_code || '',
      area_id: form.area.id,
      email: form.email.trim() || '',
      notes: null,
      area: form.area
    };

  const invId = generateInvoiceId();

    const mappedItems = items.map(it => {
      const variantLabel = it.variantLabel || it.variant || it.variant_size || null;
      let variantSize = null;
      if (it.variantSize && typeof it.variantSize === 'number') variantSize = it.variantSize;
      else if (it.variant_size && typeof it.variant_size === 'number') variantSize = it.variant_size;
      else if (variantLabel) {
        const m = String(variantLabel).match(/(\d+(?:\.\d+)?)/);
        if (m) variantSize = Number(m[1]);
      }
      return {
        productId: it.productId,
        name: it.name,
        variant: variantLabel,
        variantLabel,
        variantSize,
        price: Number(it.price) || 0,
        retailPrice: Number(it.retailPrice || it.price || 0) || 0,
        priceMode: it.priceMode || 'retail',
        quantity: Number(it.quantity) || 1,
        weight: Number(it.weight) || 0,
        subtotal: (Number(it.price)||0) * (Number(it.quantity)||1),
      };
    });

    try {
      setSaving(true);
      // generate stable guestSessionId
      let guestSessionId = null;
      try {
        if (typeof window !== 'undefined') {
          guestSessionId = localStorage.getItem('guestSessionId');
          if (!guestSessionId) {
            guestSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : `gs_${Math.random().toString(36).slice(2)}_${Date.now()}`;
            localStorage.setItem('guestSessionId', guestSessionId);
          }
        }
      } catch (_) {}
      // Create invoice via server API
      const resp = await fetch('/api/invoices/create-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invId,
          buyerName: form.buyerName.trim(),
          buyerEmail: form.email.trim() || '',
          buyerPhone: form.phone.trim(),
          shippingAddress,
          items: mappedItems,
          gateway: 'xendit',
          guestUid: null,
          guestSessionId,
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Gagal membuat invoice');

      // remove selected items from guest cart
      const selectedKey = new Set(items.map(it => `${it.productId}|${it.variantLabel||''}`));
      removeGuestItem((it) => selectedKey.has(`${it.productId}|${it.variantLabel||''}`));
      router.push(`/product/payment/${data.invoiceId || invId}`);
    } catch (e) {
      console.error('Gagal membuat invoice guest:', e);
      alert(e.message || 'Gagal membuat invoice. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <main className="max-w-md mx-auto px-3 py-4">
      <h1 className="text-lg font-semibold mb-3">Checkout Tamu</h1>

      <section className="bg-white rounded shadow p-3 mb-4">
        <h2 className="text-sm font-semibold mb-2">Data Penerima</h2>
        <div className="space-y-2 text-sm">
          <div>
            <label className="block text-xs text-gray-600">Nama</label>
            <input 
              className="border rounded px-2 py-1 w-full" 
              name="buyerName"
              value={form.buyerName} 
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">No. HP</label>
            <input 
              className="border rounded px-2 py-1 w-full" 
              name="phone"
              value={form.phone} 
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Email (opsional)</label>
            <input 
              className="border rounded px-2 py-1 w-full" 
              name="email"
              value={form.email} 
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">Alamat Jalan</label>
            <textarea 
              className="border rounded px-2 py-1 w-full" 
              rows={2} 
              name="street"
              value={form.street} 
              onChange={handleChange}
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
        </div>
      </section>

      <section className="bg-white rounded shadow p-3 mb-4">
        <h2 className="text-sm font-semibold mb-2">Ringkasan Pesanan</h2>
        <div className="text-xs text-gray-700 mb-1">{items.length} produk • Berat {totalWeight} g</div>
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-semibold text-red-600">Rp {subtotal.toLocaleString('id-ID')}</span>
        </div>
      </section>

      <button
        className="w-full bg-red-600 text-white py-2 rounded font-semibold text-sm disabled:opacity-50"
        onClick={handleCreateInvoice}
        disabled={saving}
      >
        Lanjut ke Pembayaran
      </button>
    </main>
  );
}
