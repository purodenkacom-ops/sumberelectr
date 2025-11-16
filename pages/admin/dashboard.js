import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore } from '../../utils/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getCountFromServer } from 'firebase/firestore'; // ADD
import { onAuthStateChanged, reload } from 'firebase/auth';
import AdminLayout from './_layout';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setPermError(null);
      if (!user) {
        router.push('/login');
        return;
      }
      await reload(user);
      if (!user.emailVerified) {
        router.push('/please-verify');
        return;
      }
      try {
        const docRef = doc(firestore, 'users', user.uid);
        const userSnap = await getDoc(docRef);
        if (!userSnap.exists()) {
          router.push('/login');
          return;
        }
        const data = userSnap.data();
        if (data.role !== 'admin') {
          router.push('/unauthorized');
          return;
        }
        setUserData(data);

        // Parallel fetch counts (admin allowed by rules)
        const productsActiveQ = query(
          collection(firestore, 'products'),
          where('status', '==', 'active')
        );

        const invoiceStatusList = ['waiting','awaiting_payment','packed','shipped','completed'];
        const invoiceQueries = invoiceStatusList.map(st =>
          query(collection(firestore, 'invoices'), where('status','==', st))
        );

        // Orders collection may be deprecated; keep but ignore if permission denied.
        const ordersQ = query(collection(firestore, 'orders'));

        const notifsQ = query(
          collection(firestore, 'notifications'),
          where('userId','==', user.uid),
          where('read','==', false)
        );

        const countPromises = [
          getCountFromServer(productsActiveQ).catch(e => ({ error:e })),
          ...invoiceQueries.map(qr => getCountFromServer(qr).catch(e=>({ error:e }))) ,
          getCountFromServer(ordersQ).catch(e => ({ error:e })),
          getCountFromServer(notifsQ).catch(e => ({ error:e }))
        ];

        const results = await Promise.all(countPromises);

        // Map results
        const prodRes = results[0];
        const invRes = results.slice(1, 1 + invoiceStatusList.length);
        const ordersRes = results[1 + invoiceStatusList.length];
        const notifRes = results[2 + invoiceStatusList.length];

        if (prodRes.error) console.warn('Product count error', prodRes.error);
        setProductCount(prodRes.error ? 0 : prodRes.data().count);

        const invCountsObj = {};
        invoiceStatusList.forEach((st, i) => {
          invCountsObj[st] = invRes[i].error ? 0 : invRes[i].data().count;
          if (invRes[i].error) console.warn('Invoice count error', st, invRes[i].error);
        });
        setInvoiceCounts(invCountsObj);

        setOrderCount(ordersRes.error ? 0 : ordersRes.data().count);
        if (ordersRes.error) console.warn('Orders count error', ordersRes.error);

        setUnreadNotifs(notifRes.error ? 0 : notifRes.data().count);
        if (notifRes.error) console.warn('Notif count error', notifRes.error);

        // Compute total sales (sum grandTotal of paid+packed+shipped+completed)
        // Lightweight: fetch limited docs; for full accuracy consider Cloud Function aggregate
        let total = 0;
        try {
          const salesStatuses = ['paid','packed','shipped','completed'];
          // Batch queries sequentially (avoid composite index explosion)
            for (const st of salesStatuses) {
              const qs = await getDocs(
                query(collection(firestore,'invoices'), where('status','==', st))
              );
              qs.docs.forEach(d => { total += (d.data().grandTotal || 0); });
            }
        } catch (e) {
          console.warn('Total sales calc error', e);
        }
        setTotalSales(total);

      } catch (e) {
        console.error('Dashboard load error', e);
        if (e.code === 'permission-denied') setPermError('Permission denied: cek Firestore rules atau role admin.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
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
            Welcome, {userData?.fullName || userData?.name || 'Admin'}
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
              <li>• Verifikasi & Manajemen Pengguna</li>
              <li>• Monitor Invoice & Pembayaran</li>
              <li>• Kelola Voucher & Banner Promosi</li>
              <li>• Laporan Penjualan (pengembangan)</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Komponen kecil untuk kartu statistik
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