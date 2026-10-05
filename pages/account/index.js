import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

// Firebase fully removed - all queries migrated to Supabase

import { FaTruck, FaBoxOpen, FaMoneyCheckAlt, FaCheckCircle, FaMotorcycle } from 'react-icons/fa'; // sudah ada
import Image from 'next/image';
import AreaSelect from '@/components/AreaSelect';

// Tab mapping (referensi utama)
const TAB_LABEL = {
  belum_bayar: 'Belum Bayar',
  dikemas: 'Diproses', // optional: ubah label karena sekarang mencakup 'paid'
  dikirim: 'Dikirim'
};

// Tambahkan grouping status agar konsisten satu sumber
const STATUS_GROUPS = {
  belum_bayar: ['draft', 'awaiting_payment', 'waiting'],
  dikemas: ['paid', 'packed', 'cancellation_requested'],
  dikirim: ['shipped']
};

// Tambah helper pembatalan buyer
const canBuyerRequestCancel = (inv) => {
  if (!inv) return false;
  if (inv.status === 'cancellation_requested') return false;
  return ['paid','packed'].includes(inv.status);
};

// Ikon sederhana
const TabIcon = ({ tab }) => {
  switch (tab) {
    case 'belum_bayar':
      return (
        <FaMoneyCheckAlt className="w-7 h-7 mb-1 text-primary" />
      );
    case 'dikemas':
      return (
        <FaBoxOpen className="w-7 h-7 mb-1 text-primary" />
      );
    case 'dikirim':
      return (
        <FaTruck className="w-7 h-7 mb-1 text-primary" />
      );
    default:
      return null;
  }
};

// GANTI komponen ShippingProgress lama dengan yang baru ini
const ShippingProgress = ({ status, biteshipStatus }) => {
  const s = (biteshipStatus || status || '').toLowerCase();

  // Tentukan fase (0..3)
  let phase = 0;
  if (['confirmed','allocated','pickingup','picking_up'].includes(s)) phase = 0;
  else if (['picked'].includes(s)) phase = 1;
  else if (['droppingoff','dropping_off','onway','on_the_way','intransit','in_transit'].includes(s)) phase = 2;
  else if (['delivered','completed'].includes(s)) phase = 3;
  if (!biteshipStatus && status === 'shipped') phase = Math.max(phase, 1);

  const steps = [
    { key: 'pickup',      label: 'Dijemput Kurir', icon: <FaBoxOpen /> },
    { key: 'in_transit',  label: 'Dalam Perjalanan', icon: <FaTruck /> },
    { key: 'out_delivery',label: 'Pengantaran', icon: <FaMotorcycle /> },
    { key: 'delivered',   label: 'Sampai', icon: <FaCheckCircle /> }
  ];

  const progressTarget = (phase / (steps.length - 1)) * 100;

  // Animasi width garis
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    // smooth animate
    requestAnimationFrame(() => setProgress(progressTarget));
  }, [progressTarget]);

  return (
    <div className="mt-4 mb-6">
      <h5 className="text-xs font-semibold text-gray-700 mb-3">Status Pengiriman</h5>

      <div className="relative px-2">
        {/* Garis dasar */}
        <div className="absolute left-4 right-4 top-7 h-1 rounded-full bg-gray-200" />
        {/* Garis progres */}
        <div
          className="absolute left-4 top-7 h-1 rounded-full bg-gradient-to-r from-blueLight to-blueMedium transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />

        <div className="flex justify-between relative z-10">
          {steps.map((st, idx) => {
            const active = idx <= phase;
            const current = idx === phase;
            return (
              <div key={st.key} className="flex flex-col items-center text-center w-1/4">
                <div className="relative">
                  {/* Pulse current */}
                  {current && (
                    <span className="absolute inset-0 flex">
                      <span className="m-auto w-10 h-10 rounded-full bg-blueLight/30 animate-ping" />
                    </span>
                  )}
                  <div
                    className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-all duration-500
                      ${active
                        ? 'border-primary bg-white text-primary shadow-sm scale-105'
                        : 'border-gray-300 bg-gray-100 text-gray-400'}`
                    }
                  >
                    <span className="text-lg">{st.icon}</span>
                  </div>
                </div>
                <div
                  className={`mt-2 text-[10px] font-medium leading-snug transition-colors duration-500
                    ${active ? 'text-primary' : 'text-gray-400'}`}
                >
                  {st.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 text-[10px] text-gray-500 text-center">
        {phase < steps.length - 1 && biteshipStatus && !['delivered','completed'].includes(s) &&
          `Status kurir: ${biteshipStatus}`}
        {['delivered','completed'].includes(s) && 'Paket telah diterima (Delivered).'}
      </div>
    </div>
  );
};

export default function BuyerDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('belum_bayar');
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Counts badge
  const [counts, setCounts] = useState({
    belum_bayar: 0,
    dikemas: 0,
    dikirim: 0
  });

  // Modal pembatalan
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Tambah state untuk popup detail invoice
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);

  // Tambah state untuk cache gambar produk
  const [productImages, setProductImages] = useState({});

  // Tambah state untuk popup riwayat
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyInvoices, setHistoryInvoices] = useState([]);

  // Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewInvoice, setReviewInvoice] = useState(null);
  const [reviewForm, setReviewForm] = useState({}); // { [productId]: { rating, comment } }
  const [reviewExisting, setReviewExisting] = useState({}); // { [productId]: { rating, comment, createdAt } }
  const [reviewSubmitting, setReviewSubmitting] = useState({}); // { [productId]: boolean }

  // State untuk ganti alamat
  const [addrModalOpen, setAddrModalOpen] = useState(false);
  const [addrStreet, setAddrStreet] = useState('');
  const [addrArea, setAddrArea] = useState(null); // full area object from AreaSelect
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrError, setAddrError] = useState('');

  const { user, logout, loading: authLoading } = useAuth();

  // Auth listener via AuthContext (Supabase)
  useEffect(() => {
    if (authLoading) return;
    setAuthReady(true);
    if (user) {
      setUserId(user.id || user.uid);
      setUserProfile(user);
    } else {
      setUserId(null);
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // Ambil profil
  const loadProfile = useCallback(async (uid) => {
    try {
      const { data } = await supabase.from('users').select('*').eq('id', uid).single();
      setUserProfile(data || null);
    } catch (e) {
      console.warn('User profile fetch error:', e.message);
    }
  }, []);

  useEffect(() => {
    if (authReady && userId) loadProfile(userId);
  }, [authReady, userId, loadProfile]);

  // Realtime invoices by buyerId
  useEffect(() => {
    if (!authReady) return;
    if (!userId) return;

    setLoadingInvoices(true);
    setErrorMsg(null);
    supabase.from('invoices').select('*').eq('buyer_id', userId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErrorMsg(error.message);
        else setAllInvoices(data || []);
        setLoadingInvoices(false);
      });
  }, [authReady, userId]);

  // Ganti useEffect hitung counts & filter
  useEffect(() => {
    // Hitung counts
    const unpaid = allInvoices.filter(i => STATUS_GROUPS.belum_bayar.includes(i.status)).length;
    const processing = allInvoices.filter(i =>
      STATUS_GROUPS.dikemas.includes(i.status) ||
      // tetap dukung case khusus (waiting COD approved) agar muncul di dikemas
      (i.status === 'waiting' && i.codApproved === true)
    ).length;
    const shipped = allInvoices.filter(i => STATUS_GROUPS.dikirim.includes(i.status)).length;

    setCounts({ belum_bayar: unpaid, dikemas: processing, dikirim: shipped });

    let filtered = [];
    if (activeTab === 'belum_bayar') {
      filtered = allInvoices.filter(i => STATUS_GROUPS.belum_bayar.includes(i.status));
    } else if (activeTab === 'dikemas') {
      filtered = allInvoices.filter(i =>
        STATUS_GROUPS.dikemas.includes(i.status) ||
        (i.status === 'waiting' && i.codApproved === true)
      );
    } else if (activeTab === 'dikirim') {
      filtered = allInvoices.filter(i => STATUS_GROUPS.dikirim.includes(i.status));
    }
    setInvoices(filtered);
  }, [allInvoices, activeTab]);

  const formatCurrency = (v) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })
      .format(v || 0);

  const formatDate = (val) => {
    if (!val) return '';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('id-ID');
  };

  // Open modal
  const openCancelModal = (inv) => {
    setCancelTarget(inv);
    setCancelReason('');
    setCancelError('');
    setCancelModalOpen(true);
  };

  // (Opsional) helper buat notifikasi admin
  async function pushAdminCancellationNotif(invId, reason, uid) {
    try {
      await supabase.from('admin_notifications').insert({
        type: 'cancellation_request',
        invoice_id: invId,
        reason,
        user_id: uid || null,
        created_at: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      console.warn('Notif admin gagal:', e.message);
    }
  }

  // Submit cancel (TIDAK batalkan order ke Biteship; hanya request + notif)
  const submitCancellation = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 8) {
      setCancelError('Alasan minimal 8 karakter.');
      return;
    }
    setCancelSubmitting(true);
    setCancelError('');
    try {
      const { data: invData, error: invErr } = await supabase.from('invoices').select('*').eq('id', cancelTarget.id).single();
      if (invErr || !invData) {
        setCancelError('Invoice tidak ditemukan (sudah dihapus?).');
        setCancelSubmitting(false);
        return;
      }

      const payload = {
        previous_status: invData.status || null,
        status: 'cancellation_requested',
        cancellation_reason: reason,
        cancellation_requested_at: new Date().toISOString()
      };

      await supabase.from('invoices').update(payload).eq('id', cancelTarget.id);

      // Notifikasi admin
      await pushAdminCancellationNotif(cancelTarget.id, reason, userId);
      setCancelModalOpen(false);
    } catch (e) {
      console.error('Submit cancellation failed:', e);
      setCancelError(e.message || 'Gagal mengajukan pembatalan.');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Hapus invoice (hanya draft / awaiting_payment milik user)
  const deleteInvoice = async (inv) => {
    if (!confirm('Hapus invoice ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await supabase.from('invoices').delete().eq('id', inv.id);
    } catch (e) {
      alert('Gagal menghapus: ' + e.message);
    }
  };

  // Fungsi buka detail invoice
  const openDetailModal = (inv) => {
    setDetailInvoice(inv);
    setDetailModalOpen(true);
  };

  // Fungsi tutup detail invoice
  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setDetailInvoice(null);
  };

  // Fungsi fetch gambar produk berdasarkan productId
  const fetchProductImage = useCallback(async (productId) => {
    if (!productId || productImages[productId]) return;
    try {
      const { data: pd } = await supabase.from('products').select('images,image').eq('id', productId).single();
      if (pd) {
        let best = '';
        const arr = Array.isArray(pd.images) ? pd.images : [];
        for (const v of arr) { if (typeof v === 'string' && v.trim()) { best = v; break; } }
        if (!best && typeof pd.image === 'string' && pd.image.trim()) best = pd.image;
        setProductImages(prev => ({ ...prev, [productId]: best || '/no-image.png' }));
      } else {
        setProductImages(prev => ({
          ...prev,
          [productId]: '/no-image.png'
        }));
      }
    } catch {
      setProductImages(prev => ({
        ...prev,
        [productId]: '/no-image.png'
      }));
    }
  }, [productImages]);

  // Fetch gambar produk setiap kali detailInvoice berubah
  useEffect(() => {
    if (detailModalOpen && detailInvoice?.items) {
      detailInvoice.items.forEach(item => {
        if (item.productId) fetchProductImage(item.productId);
      });
    }
  }, [detailModalOpen, detailInvoice, fetchProductImage]);

  // Fungsi buka riwayat
  const openHistoryModal = async () => {
    // Fetch invoice dengan status selesai (misal 'completed' atau 'done')
    const buyerId = userProfile?.id || userId;
    if (!buyerId) {
      setHistoryInvoices([]);
      setHistoryModalOpen(true);
      return;
    }
    const q = query(
    );
    try {
      const { data } = await supabase.from('invoices').select('*').eq('buyer_id', buyerId).eq('status', 'completed');
      setHistoryInvoices(data || []);
    } catch (e) {
      setHistoryInvoices([]);
    }
    setHistoryModalOpen(true);
  };

  // Open review form for an invoice
  const openReviewModal = async (inv) => {
    if (!inv) return;
    setReviewInvoice(inv);
    setReviewModalOpen(true);

    // Seed form with items
    const formSeed = {};
    (inv.items || []).forEach(it => {
      const pid = it.productId ? String(it.productId) : null;
      if (!pid) return;
      formSeed[pid] = { rating: 0, comment: '' };
    });
    setReviewForm(formSeed);

    // Fetch existing reviews for this invoice and buyer
    try {
      const buyerId = userProfile?.id || userId;
      if (!buyerId) return;
      const { data: revData } = await supabase.from('product_reviews').select('*').eq('buyer_id', buyerId).eq('invoice_id', inv.id);
      const existMap = {};
      (revData || []).forEach(r => { if (r.product_id) existMap[String(r.product_id)] = r; });
      setReviewExisting(existMap);
      // Pre-fill form with existing (read-only will be enforced in UI)
      setReviewForm(prev => {
        const cp = { ...prev };
        Object.keys(existMap).forEach(pid => {
          cp[pid] = { rating: Number(existMap[pid].rating) || 0, comment: existMap[pid].comment || '' };
        });
        return cp;
      });
    } catch (e) {
      console.warn('Load existing reviews failed:', e);
    }
  };

  const closeReviewModal = () => {
    setReviewModalOpen(false);
    setReviewInvoice(null);
    setReviewForm({});
    setReviewExisting({});
    setReviewSubmitting({});
  };

  const submitItemReview = async (productId) => {
    if (!reviewInvoice || !productId) return;
    const pid = String(productId);
    // If exists, do nothing (immutable)
    if (reviewExisting[pid]) return;
    const entry = reviewForm[pid] || { rating: 0, comment: '' };
    const rating = Number(entry.rating) || 0;
    const comment = (entry.comment || '').trim();
    if (rating < 1 || rating > 5) {
      alert('Pilih rating bintang 1-5.');
      return;
    }
    if (comment.length < 5) {
      alert('Tulis ulasan min. 5 karakter.');
      return;
    }
    try {
      setReviewSubmitting(prev => ({ ...prev, [pid]: true }));
      const buyerId = userProfile?.id || userId;
      const buyerName = userProfile?.name || userProfile?.buyerName || reviewInvoice.buyerName || 'Pengguna';
      const reviewId = `${buyerId}_${reviewInvoice.id}_${pid}`;
      const { data: existing } = await supabase.from('product_reviews').select('id').eq('id', reviewId).maybeSingle();
      if (existing) throw new Error('Ulasan untuk produk ini sudah pernah dikirim.');
      const { error: revErr } = await supabase.from('product_reviews').insert({
        id: reviewId,
        product_id: pid,
        invoice_id: reviewInvoice.id,
        buyer_id: buyerId,
        buyer_name: buyerName,
        rating,
        comment,
        created_at: new Date().toISOString()
      });
      if (revErr) throw new Error(revErr.message);
      // Lock this item
      setReviewExisting(prev => ({
        ...prev,
        [pid]: { productId: pid, invoiceId: reviewInvoice.id, buyerId, buyerName, rating, comment, createdAt: new Date() }
      }));
      alert('Ulasan terkirim. Terima kasih!');
    } catch (e) {
      console.error('Submit review failed:', e);
      alert(e.message || 'Gagal mengirim ulasan.');
    } finally {
      setReviewSubmitting(prev => ({ ...prev, [pid]: false }));
    }
  };

  // === Tandai pesanan selesai (aktif hanya jika tracking delivered) ===
  const markCompleted = useCallback(async () => {
    if (!detailInvoice) return;
    const delivered = (detailInvoice.biteshipStatus || '').toLowerCase() === 'delivered';
    if (!delivered) {
      alert('Status pengiriman belum delivered.');
      return;
    }
    try {
      await supabase.from('invoices').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', detailInvoice.id);
      // Update koleksi global
      setAllInvoices(prev =>
        prev.map(inv =>
          inv.id === detailInvoice.id
            ? { ...inv, status: 'completed', completedAt: new Date() }
            : inv
        )
      );
      // Hapus dari daftar tab dikirim saat ini
      setInvoices(prev => prev.filter(inv => inv.id !== detailInvoice.id));
      // Sinkron modal
      setDetailInvoice(prev => prev ? { ...prev, status: 'completed' } : prev);
      setDetailModalOpen(false);
    } catch (e) {
      alert('Gagal menandai selesai: ' + e.message);
    }
  }, [detailInvoice]);

  const hasCodWaiting =
    activeTab === 'belum_bayar' &&
    invoices.some(i => i.paymentMethod === 'cod');

  const currentTabTitle =
    (activeTab === 'belum_bayar' && hasCodWaiting)
      ? 'Menunggu Konfirmasi COD'
      : TAB_LABEL[activeTab];

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Memeriksa sesi...
      </div>
    );
  }
  if (authReady && !userId) return null;

  const displayName = userProfile?.name || userProfile?.buyerName || 'Pengguna';
  const avatar = userProfile?.avatar || userProfile?.profilePicture || '';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Back */}
        <button
          onClick={() => router.push('/')}
          className="group mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 backdrop-blur px-4 py-2 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-primary transition shadow-md"
        >
          <svg className="w-4 h-4 stroke-current transition-transform group-hover:-translate-x-0.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Beranda</span>
        </button>

        {/* Header Profil */}
  <div className="bg-gradient-to-r from-blueLight to-blueMedium rounded-xl p-5 mb-6 text-white shadow-xl ring-1 ring-black/10">
          <div className="flex items-center gap-4 relative">
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/40 bg-white/20 flex items-center justify-center">
              {avatar ? (
                <Image
                  src={avatar}
                  alt={displayName}
                  width={80}
                  height={80}
                  className="rounded-full"
                  priority
                />
              ) : (
                <span className="text-xl font-semibold">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{displayName}</h1>
              <div className="text-[11px] opacity-90 mt-1 truncate">{userProfile?.email || ''}</div>
              <div className="mt-2">
                <button onClick={() => {
                  // initialize modal fields from userProfile
                  setAddrStreet(userProfile?.street || userProfile?.address || '');
                  setAddrArea(userProfile?.area || null);
                  setAddrError('');
                  setAddrModalOpen(true);
                }} className="text-xs text-white/90 underline">Ganti Alamat</button>
              </div>
            </div>
            <div className="ml-4">
              <button
                onClick={async () => {
                  try {
                    await logout();
                  } catch (e) {
                    console.error('Logout error', e);
                  }
                }}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-xl ring-1 ring-black/5 mb-6">
          <div className="flex justify-between items-center px-5 py-3 border-b">
            <h2 className="text-sm font-semibold text-gray-700 tracking-wide">
              Pesanan Saya
            </h2>
            <button
              onClick={openHistoryModal}
              className="text-xs text-primary hover:underline"
            >
              Riwayat
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 p-4">
            {['belum_bayar', 'dikemas', 'dikirim'].map(tab => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative flex flex-col items-center rounded-lg p-3 text-xs font-medium transition
                    ${active
                      ? 'bg-red-50 text-primary border border-red-200 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <TabIcon tab={tab} />
                  <span>{TAB_LABEL[tab]}</span>
                  {counts[tab] > 0 && (
                    <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[10px] flex items-center justify-center font-semibold
                      ${active ? 'bg-primary text-white' : 'bg-red-500 text-white'}`}>
                      {counts[tab]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* List Invoices */}
        <div className="bg-white rounded-xl shadow-[0_6px_18px_-2px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
          <div className="px-5 py-3 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">
              {currentTabTitle} ({invoices.length})
            </h3>
          </div>
          <div>
            {loadingInvoices ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                Memuat data...
              </div>
            ) : errorMsg ? (
              <div className="py-10 text-center text-red-600 text-xs">
                Gagal memuat: {errorMsg}
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                Tidak ada {TAB_LABEL[activeTab].toLowerCase()}.
              </div>
            ) : (
              invoices.map(inv => {
                const itemName =
                  inv.productName ||
                  inv.items?.[0]?.name ||
                  'Produk';
                const amount =
                  inv.amount ||
                  inv.grandTotal ||
                  inv.subtotal ||
                  0;
                const canRequestCancel =
                  activeTab === 'dikemas' && canBuyerRequestCancel(inv);
                return (
                  <div
                    key={inv.id}
                    className="px-5 py-4 border-b last:border-b-0 hover:bg-gray-50 transition relative"
                  >
                    {inv.status === 'cancellation_requested' && (
                      <span className="absolute top-2 right-4 text-[10px] font-semibold bg-amber-500 text-white px-2 py-0.5 rounded shadow">
                        Pembatalan Diajukan
                      </span>
                    )}

                    <div className="flex justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {itemName}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Invoice: {inv.id}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {formatDate(inv.createdAt)}
                        </p>
                        {(inv.status === 'cancellation_requested' && inv.cancellationReason) && (
                          <p className="mt-1 text-[11px] text-amber-600 line-clamp-2">
                            Alasan: {inv.cancellationReason}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(amount)}
                        </p>
                        <div className="mt-2 flex flex-col items-end gap-1">
                          {activeTab === 'belum_bayar' && (
                            inv.paymentMethod === 'cod' ? (
                              <button
                                onClick={() => openDetailModal(inv)}
                                className="text-xs bg-primary hover:bg-blueDark text-white px-3 py-1.5 rounded-md font-medium shadow"
                              >
                                Detail
                              </button>
                            ) : (
                              <button
                                onClick={() => router.push(`/product/payment/${inv.id}`)}
                                className="text-xs bg-gradient-to-r from-blueLight to-primary hover:from-primary hover:to-blueDark text-white px-3 py-1.5 rounded-md font-medium shadow"
                              >
                                Bayar
                              </button>
                            )
                          )}
                          {activeTab === 'dikirim' && (
                            <button
                              onClick={() => openDetailModal(inv)}
                              className="text-xs bg-primary hover:bg-blueDark text-white px-3 py-1.5 rounded-md font-medium shadow"
                            >
                              Detail
                            </button>
                          )}
                          {activeTab === 'dikemas' && (
                            <>
                              <button
                                onClick={() => openDetailModal(inv)}
                                className="text-xs bg-primary hover:bg-blueDark text-white px-3 py-1.5 rounded-md font-medium shadow"
                              >
                                Detail
                              </button>
                            </>
                          )}
                          {activeTab === 'belum_bayar' && (inv.status === 'draft' || inv.status === 'awaiting_payment') && (
                            <button
                              onClick={() => deleteInvoice(inv)}
                              className="text-[11px] bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 hover:from-red-500 hover:via-red-600 hover:to-red-500 hover:text-white text-gray-700 px-3 py-1.5 rounded-full font-semibold shadow border border-gray-300 transition"
                              title="Hapus invoice"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Detail Invoice */}
      {detailModalOpen && detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDetailModal}
          />
          <div className="relative z-50 w-full max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-fadeIn">
            <h4 className="text-sm font-semibold text-gray-800 mb-1">
              Detail Invoice
            </h4>

            {/* Progress pengiriman jika status shipped dan belum completed */}
            {detailInvoice.status === 'shipped' && (
              <ShippingProgress
                status={detailInvoice.status}
                biteshipStatus={detailInvoice.biteshipStatus}
              />
            )}

            <div className="mb-2 text-xs text-gray-700">
              <div className="font-semibold">{detailInvoice.buyerName || detailInvoice.name}</div>
              <div>{detailInvoice.shippingAddress?.address || '-'}</div>
              <div>{detailInvoice.shippingAddress?.city || ''} {detailInvoice.shippingAddress?.postal_code || ''}</div>
              <div>{detailInvoice.shippingAddress?.province || ''}</div>
              <div className="mt-2 text-gray-500">Invoice: {detailInvoice.id}</div>
            </div>
            <div className="mb-2">
              {detailInvoice.items?.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 border-b py-2 last:border-b-0">
                  <Image
                    src={
                      productImages[item.productId] ||
                      (Array.isArray(item.images)
                        ? (item.images.find(u => typeof u === 'string' && u.trim()) || null)
                        : (typeof item.images === 'string' && item.images.trim() ? item.images : null)
                      ) ||
                      (typeof item.image === 'string' && item.image.trim() ? item.image : null) ||
                      '/no-image.png'
                    }
                    alt={item.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 object-cover rounded border"
                    priority={false}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-xs">{item.name}</div>
                    {item.variant && <div className="text-[10px] text-gray-500">Varian: {item.variant}</div>}
                    <div className="text-[10px] text-gray-500">Qty: {item.quantity}</div>
                  </div>
                  <div className="text-xs font-semibold text-primary">
                    Rp {Number(item.price).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs">
              <div className="flex justify-between mb-1">
                <span>Subtotal</span>
                <span>Rp {Number(detailInvoice.subtotal || 0).toLocaleString('id-ID')}</span>
              </div>
              {detailInvoice.voucherDiscount > 0 && (
                <div className="flex justify-between mb-1 text-green-600">
                  <span>Voucher</span>
                  <span>- Rp {Number(detailInvoice.voucherDiscount).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <span>Ongkir</span>
                <span>Rp {Number(detailInvoice.shippingCost || 0).toLocaleString('id-ID')}</span>
              </div>
              {detailInvoice.codFee > 0 && (
                <div className="flex justify-between mb-1">
                  <span>COD Fee</span>
                  <span>Rp {Number(detailInvoice.codFee).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-blueDark mt-2">
                <span>Total</span>
                <span>Rp {Number(detailInvoice.grandTotal || detailInvoice.amount || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
            {/* Tombol Ajukan Pembatalan di popup */}
            {activeTab === 'dikemas' && canBuyerRequestCancel(detailInvoice) && (
              <button
                onClick={() => {
                  setCancelTarget(detailInvoice);
                  setDetailModalOpen(false);
                  setCancelModalOpen(true);
                }}
                className="mt-5 w-full text-xs bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 hover:from-rose-600 hover:via-red-600 hover:to-amber-600 text-white px-4 py-2 rounded-full font-semibold shadow-md"
              >
                Ajukan Pembatalan
              </button>
            )}
            {detailInvoice.status === 'shipped' && (
              <button
                onClick={markCompleted}
                disabled={(detailInvoice.biteshipStatus || '').toLowerCase() !== 'delivered'}
                className={`mt-4 w-full text-xs font-semibold px-4 py-2 rounded-full shadow
                  ${(detailInvoice.biteshipStatus || '').toLowerCase() === 'delivered'
                    ? 'bg-primary hover:bg-blueDark text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                Selesai
              </button>
            )}
            <button
              onClick={closeDetailModal}
              className="mt-3 w-full px-4 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Ganti Alamat */}
      {addrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAddrModalOpen(false)} />
          <div className="relative z-50 w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-fadeIn">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Ganti Alamat Pengiriman</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Alamat Jalan</label>
                <input className="w-full px-3 py-2 border rounded" value={addrStreet} onChange={e => setAddrStreet(e.target.value)} placeholder="Contoh: Jl. Melati No.9B" />
              </div>

              <AreaSelect value={addrArea} label="Pilih Kecamatan / Kota" onSelect={(area) => setAddrArea(area)} />

              {addrArea && (
                <div className="text-xs bg-gray-50 p-3 rounded border text-gray-700">
                  <div><strong>{addrArea.name}</strong>, {addrArea.city_name}</div>
                  <div className="text-[12px] text-gray-500">{addrArea.province} — Kodepos: {addrArea.postal_code}</div>
                </div>
              )}

              {addrError && <div className="text-xs text-red-600">{addrError}</div>}
            </div>

            <div className="mt-4 flex gap-3">
              <button onClick={() => setAddrModalOpen(false)} className="flex-1 px-3 py-2 border rounded text-sm">Batal</button>
              <button
                onClick={async () => {
                  setAddrError('');
                  if (!addrStreet || !addrArea) { setAddrError('Lengkapi alamat dan area.'); return; }
                  setAddrSaving(true);
                  try {
                    // save address to Supabase users table
                    const areaId = addrArea.id ? String(addrArea.id) + 'IDZ' + (addrArea.postal_code || '') : '';
                    const addressStr = [addrStreet, addrArea.name, addrArea.city_name, addrArea.province, addrArea.postal_code].filter(Boolean).join(', ');
                    const profile = {
                      ...(userProfile?.profile || {}),
                      street: addrStreet,
                      area_id: areaId,
                      province: addrArea.province || '',
                      city: addrArea.city_name || '',
                      district: addrArea.name || '',
                      postal_code: addrArea.postal_code || '',
                      address: addressStr,
                      area: { ...addrArea, area_id: areaId }
                    };
                    const { error: addrErr } = await supabase.from('users').update({
                      profile,
                      updated_at: new Date().toISOString()
                    }).eq('id', userId);
                    if (addrErr) throw new Error(addrErr.message);
                    // update local profile
                    setUserProfile(prev => ({ ...(prev||{}), profile }));
                    setAddrModalOpen(false);
                  } catch (e) {
                    console.error('Save address error', e);
                    setAddrError(e.message || 'Gagal menyimpan alamat');
                  } finally { setAddrSaving(false); }
                }}
                className="px-4 py-2 bg-primary text-white rounded text-sm"
              >
                {addrSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pembatalan */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => (cancelSubmitting ? null : setCancelModalOpen(false))}
          />
          <div className="relative z-50 w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-fadeIn">
            <h4 className="text-sm font-semibold text-gray-800 mb-1">
              Ajukan Pembatalan
            </h4>
            <p className="text-xs text-gray-500 mb-4">
              Harap tuliskan alasan yang jelas. Permintaan akan direview admin.
            </p>
            <textarea
              className="w-full rounded-md border border-gray-300 focus:border-primary focus:ring focus:ring-red-200 text-xs p-2 min-h-[90px] resize-y"
              placeholder="Contoh: Ingin mengubah alamat, salah memilih produk, dsb."
              value={cancelReason}
              disabled={cancelSubmitting}
              onChange={e => setCancelReason(e.target.value)}
            />
            {cancelError && (
              <div className="mt-2 text-[11px] text-red-600">
                {cancelError}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                disabled={cancelSubmitting}
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 font-medium disabled:opacity-50"
              >
                Batal
              </button>
              <button
                disabled={cancelSubmitting}
                onClick={submitCancellation}
                className="px-5 py-2 text-xs font-semibold rounded-md bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 hover:from-red-600 hover:via-rose-600 hover:to-orange-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {cancelSubmitting && (
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Ajukan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Riwayat */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHistoryModalOpen(false)}
          />
          <div className="relative z-50 w-full max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-fadeIn">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              Riwayat Pesanan Selesai
            </h4>
            {historyInvoices.length === 0 ? (
              <div className="text-xs text-gray-500 py-6 text-center">
                Belum ada pesanan selesai.
              </div>
            ) : (
              <div className="space-y-3">
                {historyInvoices.map(inv => (
                  <div key={inv.id} className="border-b pb-2 last:border-b-0">
                    <div className="flex justify-between items-center">
                      <div className="cursor-pointer" onClick={() => openReviewModal(inv)}>
                        <div className="font-medium text-xs">{inv.items?.[0]?.name || '-'}</div>
                        <div className="text-[11px] text-gray-500">Invoice: {inv.id}</div>
                        <div className="text-[11px] text-gray-400">{formatDate(inv.createdAt)}</div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <div className="text-xs font-semibold text-primary">
                          Rp {Number(inv.grandTotal || inv.amount || 0).toLocaleString('id-ID')}
                        </div>
                        <div className="text-[10px] text-green-600 font-semibold">Selesai</div>
                        <button
                          type="button"
                          onClick={() => openReviewModal(inv)}
                          className="mt-1 text-[11px] px-2 py-0.5 rounded border border-red-300 text-primary hover:bg-red-50"
                        >Ulas</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setHistoryModalOpen(false)}
              className="mt-5 w-full px-4 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Ulasan */}
      {reviewModalOpen && reviewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeReviewModal} />
          <div className="relative z-50 w-full max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 animate-fadeIn">
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Ulas Pesanan</h4>
            <div className="text-[11px] text-gray-500 mb-3">Invoice: {reviewInvoice.id}</div>

            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
              {(reviewInvoice.items || []).map((it, idx) => {
                const pid = it.productId ? String(it.productId) : null;
                const existing = pid ? reviewExisting[pid] : null;
                const entry = pid ? (reviewForm[pid] || { rating: 0, comment: '' }) : { rating: 0, comment: '' };
                const disabled = !!existing;
                return (
                  <div key={idx} className="border rounded p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium">{it.name || 'Produk'}</div>
                      {!pid && (
                        <span className="text-[10px] text-gray-400">Tidak dapat diulas (productId kosong)</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          type="button"
                          disabled={disabled || !pid}
                          onClick={() => setReviewForm(prev => ({ ...prev, [pid]: { ...entry, rating: n } }))}
                          className={`w-6 h-6 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          aria-label={`Bintang ${n}`}
                          title={disabled ? 'Ulasan sudah terkirim' : `Beri ${n} bintang`}
                        >
                          <svg viewBox="0 0 24 24" fill={entry.rating >= n ? '#f59e0b' : 'none'} stroke="#f59e0b" strokeWidth="2">
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="mt-2 w-full border rounded px-2 py-1 text-xs"
                      rows={3}
                      placeholder={disabled ? 'Ulasan terkirim' : 'Tulis ulasan Anda (min. 5 karakter)'}
                      value={entry.comment}
                      onChange={(e) => setReviewForm(prev => ({ ...prev, [pid]: { ...entry, comment: e.target.value } }))}
                      disabled={disabled || !pid}
                    />
                    <div className="mt-2 flex justify-end">
                      {disabled ? (
                        <span className="text-[11px] text-green-700 font-semibold">Ulasan sudah terkirim</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => submitItemReview(pid)}
                          disabled={reviewSubmitting[pid] || !pid}
                          className="text-xs bg-primary text-white px-3 py-1 rounded disabled:opacity-50"
                        >
                          {reviewSubmitting[pid] ? 'Mengirim...' : 'Kirim Ulasan'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={closeReviewModal}
              className="mt-4 w-full px-4 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      
    </div>
  );
}
