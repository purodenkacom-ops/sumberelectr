import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import AdminLayout from './_layout';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [productCount, setProductCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [invoiceCounts, setInvoiceCounts] = useState({
    waiting: 0,
    awaiting_payment: 0,
    packed: 0,
    shipped: 0,
    completed: 0
  });
  const [permError, setPermError] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    if (!isAdmin) { router.push('/unauthorized'); return; }

    async function loadDashboard() {
      setPermError(null);
      try {
        const invoiceStatusList = ['waiting', 'awaiting_payment', 'packed', 'shipped', 'completed'];

        const [
          productsRes,
          ...invoiceResults
        ] = await Promise.all([
          supabase.from('products').select('id', { count: 'exact', head: true }),
          ...invoiceStatusList.map(st =>
            supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', st)
          )
        ]);

        setProductCount(productsRes.count || 0);

        const invCountsObj = {};
        invoiceStatusList.forEach((st, i) => {
          invCountsObj[st] = invoiceResults[i].count || 0;
        });
        setInvoiceCounts(invCountsObj);

        // Legacy orders count
        const { count: ordersCount } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true });
        setOrderCount(ordersCount || 0);

        // Unread notifications - disabled (table not created)
        // const { count: notifCount } = await supabase
        //   .from('notifications')
        //   .select('id', { count: 'exact', head: true })
        //   .eq('user_id', user.id)
        //   .eq('read', false);
        // setUnreadNotifs(notifCount || 0);
        setUnreadNotifs(0);

        // Total sales from paid invoices
        const salesStatuses = ['paid', 'packed', 'shipped', 'completed'];
        let total = 0;
        try {
          const { data: salesRows } = await supabase
            .from('invoices')
            .select('grand_total')
            .in('status', salesStatuses);
          for (const row of salesRows || []) {
            total += (row.grand_total || row.grandTotal || 0);
          }
        } catch (e) {
          console.warn('Total sales calc error', e);
        }
        setTotalSales(total);
      } catch (e) {
        console.error('Dashboard load error', e);
        setPermError('Gagal memuat data dashboard: ' + (e.message || String(e)));
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [authLoading, user, isAdmin, router]);

  if (authLoading || loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-white px-6 py-10">
        <div className="max-w-7xl mx-auto">
          {permError && (
            <div className="mb-4 px-4 py-3 rounded border text-sm bg-red-50 border-red-200 text-red-700">
              {permError}
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Welcome, {user?.fullName || user?.name || user?.profile?.name || 'Admin'}
          </h1>
          <p className="text-gray-600 mb-8">
            Ringkasan performa platform.
          </p>

          {/* Ringkasan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
            <StatCard label="Active Products" value={productCount} />
            <StatCard label="Menunggu Konfirmasi" value={invoiceCounts.waiting} />
            <StatCard label="Belum Bayar" value={invoiceCounts.awaiting_payment} />
            <StatCard label="Dikemas / Dikirim" value={invoiceCounts.packed + invoiceCounts.shipped} />
            <StatCard label="Selesai" value={invoiceCounts.completed} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <StatCard label="Total Orders (legacy)" value={orderCount} />
            <StatCard label="Total Sales (Invoices)" value={'Rp ' + totalSales.toLocaleString('id-ID')} />
            <StatCard label="Unread Notifications" value={unreadNotifs} />
          </div>

          {/* Tools / Links */}
          <div className="p-6 border border-gray-200 rounded-xl shadow-sm bg-white">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Admin Tools</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Kelola Produk</li>
              <li>• Verifikasi &amp; Manajemen Pengguna</li>
              <li>• Monitor Invoice &amp; Pembayaran</li>
              <li>• Kelola Voucher &amp; Banner Promosi</li>
              <li>• Laporan Penjualan (pengembangan)</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white shadow border border-gray-100 rounded-xl p-4 flex flex-col justify-between">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">
        {typeof value === 'number' ? value : value}
      </p>
    </div>
  );
}
