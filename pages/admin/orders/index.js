import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDocs,
  getDoc as getFirestoreDoc,
  deleteDoc,
  addDoc,
  setDoc,
  increment
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore, auth } from '@/utils/firebase';
import AdminLayout from '../_layout';
import Image from 'next/image';

// PAGE_SIZE
const PAGE_SIZE = 30;

// Disable any new COD actions from admin UI
const COD_DISABLED = true;

// STATUS
const STATUS_OPTIONS = [
  'draft','waiting','awaiting_payment','paid','packed','shipped','completed','cancellation_requested','cancelled','returned','expired'
];
const STATUS_LABEL = {
  draft: 'Draft',
  waiting: 'Menunggu Otorisasi COD',
  awaiting_payment: 'Belum Bayar',
  paid: 'Dibayar',
  packed: 'Dikemas',
  shipped: 'Dikirim',
  completed: 'Selesai',
  cancellation_requested: 'Pembatalan Diajukan',
  cancelled: 'Dibatalkan',
  returned: 'Retur',
  expired: 'Kedaluwarsa'
};
const STATUS_STYLE = {
  draft: 'bg-slate-100 text-slate-600',
  waiting: 'bg-orange-100 text-orange-700',
  awaiting_payment: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  packed: 'bg-red-100 text-red-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancellation_requested: 'bg-amber-200 text-amber-800 border border-amber-300',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-pink-100 text-pink-700',
  expired: 'bg-gray-200 text-gray-600'
};

const MAIN_TABS = [
  { key: 'awaiting_payment', label: 'Belum Bayar' },
  { key: 'packed', label: 'Perlu Dikirim' },
  { key: 'shipped', label: 'Dikirim' },
  { key: 'completed', label: 'Selesai' },
  { key: 'cancelled', label: 'Pembatalan' },
  { key: 'returned', label: 'Pengembalian' }
];

// Gabungan status per tab (REVISED)
const TAB_STATUS_MAP = {
  // Tambah draft supaya admin bisa lihat invoice yang belum request pembayaran
  awaiting_payment: ['draft','awaiting_payment','waiting'],
  // Masukkan 'paid' agar setelah webhook (paid) langsung muncul di tab ini untuk diproses/packing
  packed: ['paid','packed'],
  shipped: ['shipped'],
  completed: ['completed'],
  cancelled: ['cancellation_requested','cancelled','expired'],
  returned: ['returned']
};

const TRACK_FINAL = ['delivered','completed','returned','cancelled','void','failed'];
const TRACK_STATUS_MAP = {
  delivered: 'completed',
  completed: 'completed',
  returned: 'returned',
  cancelled: 'cancelled',
  void: 'cancelled',
  failed: 'cancelled'
};

/**
 * Filter pencarian lokal
 */
function applySearchFilter(rows, search) {
  if (!search || !search.trim()) return rows;
  const s = search.trim().toLowerCase();
  return rows.filter(r =>
    (r.invoiceId || r.id)?.toLowerCase().includes(s) ||
    (r.buyerName || '').toLowerCase().includes(s) ||
    (r.buyerPhone || '').toLowerCase().includes(s)
  );
}

/**
 * Bangun query Firestore (mendukung multi status via where in)
 */
function buildInvoiceQuery({ firestore, statuses, method, courier, sortField, cursor, pageSize }) {
  const colRef = collection(firestore, 'invoices');
  const clauses = [];
  if (statuses && statuses.length === 1) {
    clauses.push(where('status','==', statuses[0]));
  } else if (statuses && statuses.length > 1) {
    clauses.push(where('status','in', statuses)); // butuh index komposit (status, createdAt) jika orderBy createdAt
  }
  // Apply COD filter on server; handle Transfer (non-COD) on client to avoid multiple `in` constraints
  if (method === 'cod') clauses.push(where('paymentMethod','==', 'cod'));
  if (courier) clauses.push(where('shippingSelection.courier','==', courier));
  const orderField = sortField || 'createdAt';
  let qRef = query(colRef, ...clauses, orderBy(orderField,'desc'), limit(pageSize));
  if (cursor) {
    qRef = query(colRef, ...clauses, orderBy(orderField,'desc'), startAfter(cursor), limit(pageSize));
  }
  return { qRef, clauses };
}

/**
 * Ambil sekali (non realtime) daftar invoices
 */
async function fetchInvoicesOnce(opts) {
  const {
    firestore,
    statuses,
    method,
    courier,
    sortField,
    cursor,
    pageSize = PAGE_SIZE,
    search
  } = opts;
  const { qRef } = buildInvoiceQuery({
    firestore,
    statuses,
    method,
    courier,
    sortField,
    cursor,
    pageSize
  });
  const snap = await getDocs(qRef);
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Client-side filter for method: treat anything not 'cod' as Transfer
  if (method === 'prepaid' || method === 'transfer') {
    rows = rows.filter(r => String(r.paymentMethod || '').toLowerCase() !== 'cod');
  } else if (method === 'cod') {
    rows = rows.filter(r => String(r.paymentMethod || '').toLowerCase() === 'cod');
  }
  rows = applySearchFilter(rows, search);
  const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
  return {
    rows,
    nextCursor,
    more: !!nextCursor
  };
}

// === NEW: Daftar status tracking Biteship & deskripsi singkat ===
const BITESHIP_STATUS_DESC = {
  confirmed: 'Order dikonfirmasi, mencari kurir.',
  allocated: 'Kurir ditugaskan.',
  pickingUp: 'Kurir menuju penjemputan.',
  picked: 'Paket sudah diambil.',
  droppingOff: 'Dalam perjalanan ke penerima.',
  returnInTransit: 'Menuju kembali (retur).',
  onHold: 'Tertahan sementara.',
  delivered: 'Terkirim.',
  rejected: 'Ditolak.',
  courierNotFound: 'Kurir tidak tersedia.',
  returned: 'Retur selesai.',
  cancelled: 'Dibatalkan.',
  disposed: 'Dimusnahkan.'
};

// Status final tracking -> hentikan polling untuk invoice tsb
const BITESHIP_TRACK_FINAL = new Set([
  'delivered','returned','cancelled','rejected','courierNotFound','disposed'
]);

// ==== Tambah helper buat voucher refund (letakkan sebelum export default AdminOrdersPage) ====
async function createRefundVoucherForInvoice(firestore, invoice) {
  try {
    const amount = invoice.grandTotal || invoice.subtotal || 0;
    if (!amount || amount <= 0) return { skipped: true, reason: 'Amount 0' };
    if (!invoice.buyerId) return { skipped: true, reason: 'No buyerId' };

    // Cek apakah sudah pernah dibuat (berdasarkan sourceInvoiceId)
    const existingSnap = await getDocs(
      query(
        collection(firestore, 'vouchers'),
        where('sourceInvoiceId', '==', invoice.id)
      )
    );
    if (!existingSnap.empty) {
      return { skipped: true, reason: 'Exists' };
    }

    // Bangun kode unik
    const base = (invoice.invoiceId || invoice.id || '')
      .replace(/[^A-Za-z0-9]/g,'')
      .slice(-8)
      .toUpperCase();
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const code = `REF-${base}-${rand}`;

    const expiresAt = new Date(Date.now() + 30*24*60*60*1000); // 30 hari

    // Gunakan setDoc dengan id = code agar mudah dicari manual
    await setDoc(doc(firestore, 'vouchers', code), {
      code,
      type: 'fixed',
      amount,
      value: amount,
      max_uses: 1,
      used: 0,
      userId: invoice.buyerId,
      restrictedUserIds: [invoice.buyerId],
      sourceInvoiceId: invoice.id,
      status: 'active',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt
    });

    return { success: true, code, amount };
  } catch (e) {
    console.error('createRefundVoucherForInvoice error', e);
    return { error: e.message };
  }
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [cursor, setCursor] = useState(null);

  // -- NEW STYLE & FILTERS --
  const [activeTab, setActiveTab] = useState('awaiting_payment'); // default: Perlu Dikirim
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState('createdAt'); // Urutan
  const [courierFilter, setCourierFilter] = useState('');
  const [liveMode, setLiveMode] = useState(true);

  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rowActionId, setRowActionId] = useState(null);

  const [indexError, setIndexError] = useState(null);
  const [permError, setPermError] = useState(null);
  const unsubRef = useRef(null);
  const productImageCacheRef = useRef({});

  const pollingRef = useRef(null);

  // Cancel approval modal
  const [cancelApproveModal, setCancelApproveModal] = useState(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

  // New: Cancel packed order modal
  const [cancelPackedModal, setCancelPackedModal] = useState(null); // modal konfirmasi batal di tab Perlu Dikirim

  // Tambah state popup error window instant (letakkan bersama state lain)
  const [instantTimeError, setInstantTimeError] = useState(null);

  // Tambah state baru (bersama instantTimeError):
  const [itemCategoryError, setItemCategoryError] = useState(null);

  // Detail invoice modal (mirip account/index.js)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);

  // NEW: State untuk permintaan pembatalan
  const [cancelReqCount, setCancelReqCount] = useState(0);           // NEW
  const [cancelReqPrev, setCancelReqPrev] = useState(0);             // NEW
  const [cancelReqToast, setCancelReqToast] = useState(null);        // NEW

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setAuthReady(true);
      setIsAdmin(false);
      setAdminChecked(false);
      if (!u) {
        router.replace('/login');
        setAdminChecked(true);
        return;
      }
      try {
        const snap = await getDoc(doc(firestore, 'users', u.uid));
        setIsAdmin(snap.exists() && snap.data().role === 'admin');
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    });
    return () => unsub();
  }, [router]);

  // Build query for base & filters (dipertahankan untuk realtime)
  const buildBaseQuery = useCallback((forPage = false) => {
    const statuses = TAB_STATUS_MAP[activeTab] || [];
    const { qRef } = buildInvoiceQuery({
      firestore,
      statuses,
      method: methodFilter,
      courier: courierFilter,
      sortField: sortOption,
      cursor: forPage ? cursor : null,
      pageSize: PAGE_SIZE
    });
    return { qRef };
  }, [activeTab, methodFilter, courierFilter, sortOption, cursor]);

  // Realtime listener
  useEffect(() => {
    if (!isAdmin || !adminChecked || !liveMode) return;
    if (unsubRef.current) unsubRef.current();
    setIndexError(null);
    setOrders([]);
    setCursor(null);
    setPermError(null);
    try {
      const { qRef } = buildBaseQuery(false);
      const unsub = onSnapshot(qRef, snap => {
        let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Client-side method filter for Transfer (non-COD)
        if (methodFilter === 'prepaid' || methodFilter === 'transfer') {
          rows = rows.filter(r => String(r.paymentMethod || '').toLowerCase() !== 'cod');
        } else if (methodFilter === 'cod') {
          rows = rows.filter(r => String(r.paymentMethod || '').toLowerCase() === 'cod');
        }
        rows = applySearchFilter(rows, search);
        setOrders(rows);
        setMore(false);
      }, err => {
        if (err.code === 'permission-denied') {
          setPermError('Tidak punya izin membaca invoices.');
        } else if (err.code === 'failed-precondition') {
          const match = (err.message || '').match(/https:\/\/console\.firebase\.google\.com\/[^\s"]+/);
          setIndexError(match ? match[0] : 'Perlu membuat index.');
        }
      });
      unsubRef.current = unsub;
      return () => unsub();
    } catch {
      // ignore
    }
  }, [isAdmin, adminChecked, liveMode, buildBaseQuery, search, methodFilter]);

  // Pagination (non-realtime) gunakan fetchInvoicesOnce
  const fetchPage = useCallback(async (reset = false) => {
    if (!isAdmin || !adminChecked || liveMode || loading) return;
    setLoading(true);
    setIndexError(null);
    setPermError(null);
    try {
      const cur = reset ? null : cursor;
      const { rows, nextCursor, more } = await fetchInvoicesOnce({
        firestore,
        statuses: TAB_STATUS_MAP[activeTab] || [],
    method: methodFilter,
        courier: courierFilter,
        sortField: sortOption,
        cursor: cur,
        pageSize: PAGE_SIZE,
        search
      });
      setOrders(prev => reset ? rows : [...prev, ...rows]);
      setCursor(nextCursor);
      setMore(more);
    } catch (e) {
      if (e.code === 'permission-denied') setPermError('Tidak punya izin membaca invoices.');
      if (reset) setOrders([]);
      setMore(false);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, adminChecked, liveMode, loading, activeTab, methodFilter, courierFilter, sortOption, search, cursor]);

  useEffect(() => {
    if (!liveMode) fetchPage(true);
  }, [liveMode, activeTab, methodFilter, courierFilter, sortOption, search, fetchPage]);

  // Export current orders (Packed tab) to Excel
  const exportPackedToExcel = async () => {
    try {
      if (!orders || !orders.length) { alert('Tidak ada data untuk diexport.'); return; }
      const XLSX = await import('xlsx');
      const rows = [];
      for (const o of orders) {
        const addrObj = o.shippingAddress || o.destination || {};
        const courier = (o.shippingSelection?.courier || '').toUpperCase();
        const service = o.shippingSelection?.service_name || '';
        const createdAt = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt instanceof Date ? o.createdAt : null);
        const updatedAt = o.updatedAt?.toDate ? o.updatedAt.toDate() : (o.updatedAt instanceof Date ? o.updatedAt : null);
        const base = {
          Invoice: o.invoiceId || o.id,
          BuyerName: o.buyerName || '',
          BuyerPhone: o.buyerPhone || '',
          Address: addrObj.address || '',
          City: addrObj.city || addrObj.city_name || '',
          Province: addrObj.province || '',
          PostalCode: addrObj.postal_code || addrObj.postalCode || '',
          Courier: courier,
          Service: service,
          Method: (o.paymentMethod || '').toUpperCase(),
          Status: o.status,
          Subtotal: o.subtotal || 0,
          ShippingCost: o.shippingCost || 0,
          CODFee: o.codFee || 0,
          TransferFee: o.transferFee || 0,
          GrandTotal: o.grandTotal || o.subtotal || 0,
          CreatedAt: createdAt ? createdAt.toLocaleString('id-ID') : '',
          UpdatedAt: updatedAt ? updatedAt.toLocaleString('id-ID') : '',
          Note: o.note || ''
        };
        const items = Array.isArray(o.items) ? o.items : [];
        if (items.length === 0) {
          rows.push({ ...base, ItemName: '', Variant: '', Qty: '' });
        } else {
          items.forEach(it => {
            rows.push({
              ...base,
              ItemName: it.name || '',
              Variant: it.variant || '',
              Qty: it.quantity || 0
            });
          });
        }
      }
      const headers = [
        'Invoice','BuyerName','BuyerPhone','Address','City','Province','PostalCode',
        'Courier','Service','Method','Status',
        'Subtotal','ShippingCost','CODFee','TransferFee','GrandTotal',
        'CreatedAt','UpdatedAt',
        'ItemName','Variant','Qty',
        'Note'
      ];
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      const cols = headers.map(h => {
        let max = h.length;
        rows.forEach(r => { const v = r[h]; const l = (v==null?0:String(v).length); if (l>max) max=l; });
        return { wch: Math.min(Math.max(max + 2, 10), 50) };
      });
      ws['!cols'] = cols;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PerluDikirim');
      const now = new Date();
      const pad = n => String(n).padStart(2,'0');
      const fname = `orders-packed-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
      XLSX.writeFile(wb, fname);
    } catch (e) {
      console.error('Export Excel error:', e);
      alert('Gagal mengekspor Excel.');
    }
  };

  // Actions (doUpdateStatus, doCancel, doReturn, approveCOD) -- SAMA
  const doUpdateStatus = async (order, nextStatus) => {
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      await updateDoc(doc(firestore, 'invoices', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus } : o));
    } catch {
      alert('Gagal update status');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
      setPendingAction(null);
    }
  };
  const doCancel = async (order) => {
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      const resp = await fetch('/api/biteship/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          invoiceId: order.id,
          reasonCode: 'others',
          reasonText: 'Dibatalkan admin setelah dikirim'
        })
      });
      const data = await resp.json();

      if (!resp.ok) {
        // Cek error dari Biteship
        if (data?.error?.toLowerCase().includes('cannot cancel') || data?.error?.toLowerCase().includes('in transit')) {
          alert('Paket tidak bisa dibatalkan karena sudah dalam proses pengiriman oleh kurir.');
        } else {
          alert(data.error || 'Gagal membatalkan order.');
        }
        return;
      }

      // Update status invoice di Firestore
      await updateDoc(doc(firestore, 'invoices', order.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o));
      alert('Order dibatalkan.');
    } catch (e) {
      alert('Gagal membatalkan order.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
      setPendingAction(null);
    }
  };
  const doReturn = (order) => doUpdateStatus(order, 'returned');
  const approveCOD = async (order) => {
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      if (!order.shippingSelection) {
        alert('Data pengiriman belum lengkap.');
        setActionLoading(false);
        return;
      }
      const resp = await fetch('/api/biteship/create-cod', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          invoiceId: order.invoiceId || order.id,
          courier_code: order.shippingSelection.courier,
          courier_service_code: order.shippingSelection.service_code,
          buyer: {
            name: order.buyerName,
            phone: order.buyerPhone,
            email: order.buyerEmail
          },
          destination_address: order.shippingAddress?.address || order.shippingSelection.destination_address || '',
          destination_postal_code: order.shippingAddress?.postal_code,
          items: order.items,
          cod_amount: order.grandTotal
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert('Gagal membuat order COD.');
      } else {
        const biteshipOrderId = data.order?.id;
        const waybillId = data.order?.courier?.waybill_id;
        await updateDoc(doc(firestore, 'invoices', order.id), {
          codOrderId: biteshipOrderId,
          trackingOrderId: biteshipOrderId, // NEW
          waybillId,
          biteshipRaw: data.order,
          status: 'packed',
          updatedAt: serverTimestamp()
        });
        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          codOrderId: biteshipOrderId,
          trackingOrderId: biteshipOrderId, // NEW
          waybillId,
          biteshipRaw: data.order,
          status: 'packed'
        } : o));
      }
    } catch (e) {
      alert('Error approve COD.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
      setPendingAction(null);
    }
  };

  // Batalkan order status 'packed' (Perlu Dikirim): cancel ke Biteship lalu hapus invoice
  const cancelPackedOrder = async (order) => {
    if (!order) return;
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      await fetch('/api/biteship/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          invoiceId: order.id,
          reasonCode: 'others',
          reasonText: 'Dibatalkan admin sebelum dikirim'
        })
      }).catch(()=>{});
      await deleteDoc(doc(firestore, 'invoices', order.id));
      setOrders(prev => prev.filter(o => o.id !== order.id));
      setCancelPackedModal(null);
      alert('Order dibatalkan & dihapus.');
    } catch (e) {
      console.error(e);
      alert('Gagal membatalkan order.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
    }
  };

  // ============ TAB SPECIFIC ACTION HELPERS ============
  // 1. Belum Bayar (awaiting_payment): kirim email pengingat pembayaran
  const sendPaymentReminder = async (order) => {
    try {
      if (!order.buyerEmail) {
        alert('Email buyer tidak tersedia.');
        return;
      }
      const resp = await fetch('/api/admin/send-payment-reminder', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          invoiceId: order.invoiceId || order.id,
          email: order.buyerEmail,
          name: order.buyerName,
          total: order.grandTotal || order.subtotal
        })
      });
      if (!resp.ok) {
        alert('Gagal mengirim pengingat.');
      } else {
        alert('Pengingat dikirim.');
      }
    } catch {
      alert('Error pengingat.');
    }
  };

  // >>> PATCH: Tambah helper createShipment (NON-COD) sebelum handleShip <<<
  const createShipment = async (order) => {
    if (!order) return;
    if (order.paymentMethod === 'cod') {
      alert('Gunakan alur COD (Approve COD).');
      return;
    }
    if (!order.shippingSelection) {
      alert('Data pengiriman belum lengkap pada invoice.');
      return;
    }
    if (order.biteshipOrderId) {
      alert('Shipment sudah dibuat.');
      return;
    }
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      const resp = await fetch('/api/biteship/create-shipment', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ invoiceId: order.invoiceId || order.id })
      });
      const data = await resp.json();
      if (!resp.ok) {
        console.error('create-shipment failed', data);
        alert(data.error || 'Gagal membuat shipment.');
      } else {
        const update = {
          biteshipOrderId: data.biteshipOrderId || data.shipment?.id,
          trackingOrderId: data.biteshipOrderId || data.shipment?.id,
          waybillId: data.waybillId || data.shipment?.courier_waybill_id || '',
          biteshipStatus: data.biteshipStatus || data.shipment?.status || 'created',
          updatedAt: serverTimestamp()
        };
        // Paksa status jadi 'packed' bila masih 'paid'
        if (order.status !== 'packed') update.status = 'packed';

        await updateDoc(doc(firestore, 'invoices', order.id), update);

        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          ...update,
          status: update.status || o.status
        } : o));

        alert('Shipment berhasil dibuat & status dipindah ke Dikemas.');
      }
    } catch (e) {
      console.error(e);
      alert('Error membuat shipment.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
    }
  };

  // >>> PATCH: Modifikasi handleShip agar otomatis buat shipment jika belum ada (NON-COD) <<<
  const handleShip = async (order) => {
    setActionLoading(true);
    setRowActionId(order.id);
    try {
      const invoiceId = order.id;
      if (!invoiceId) {
        alert('Invoice ID tidak ditemukan.');
        setActionLoading(false);
        setRowActionId(null);
        return;
      }

      // Jika NON-COD & belum punya shipment, buat dulu (status bisa 'paid'/'packed')
      if (order.paymentMethod !== 'cod' && !order.biteshipOrderId) {
        const created = await fetch('/api/biteship/create-shipment', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ invoiceId })
        });
        const createdData = await created.json();
        if (!created.ok) {
          alert(createdData.error || 'Gagal membuat shipment (tidak bisa menandai dikirim).');
          setActionLoading(false);
          setRowActionId(null);
          return;
        }
        order.biteshipOrderId = createdData.biteshipOrderId || createdData.shipment?.id;
        order.trackingOrderId = order.biteshipOrderId;
        order.waybillId = createdData.waybillId || createdData.shipment?.courier_waybill_id || '';
        order.biteshipStatus = createdData.biteshipStatus || createdData.shipment?.status || 'created';

        // Pastikan status jadi packed sebelum shipped
        if (order.status !== 'packed') {
          await updateDoc(doc(firestore, 'invoices', order.id), {
            status: 'packed',
            biteshipOrderId: order.biteshipOrderId,
            trackingOrderId: order.trackingOrderId,
            waybillId: order.waybillId,
            biteshipStatus: order.biteshipStatus,
            updatedAt: serverTimestamp()
          });
          setOrders(prev => prev.map(o => o.id === order.id ? {
            ...o,
            status: 'packed',
            biteshipOrderId: order.biteshipOrderId,
            trackingOrderId: order.trackingOrderId,
            waybillId: order.waybillId,
            biteshipStatus: order.biteshipStatus
          } : o));
        }
      }

      // Ambil status terbaru dulu (jika sudah ada order id)
      const resp = await fetch(`/api/biteship/retrieve-order?invoiceId=${encodeURIComponent(invoiceId)}`);
      const data = await resp.json();

      if (!resp.ok) {
        // fallback: mark shipped
        await updateDoc(doc(firestore, 'invoices', order.id), {
          status: 'shipped',
          shippedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'shipped', shippedAt: new Date() } : o));
        alert('Pesanan ditandai Dikirim (fallback).');
      } else {
        const biteshipStatus = data.biteshipStatus || data.data?.status || null;
        const waybill = data.waybill || data.data?.courier?.waybill_id || order.waybillId || order.codOrderId;
        const biteshipOrderId = data.data?.id || order.trackingOrderId || order.codOrderId || order.biteshipOrderId;

        await updateDoc(doc(firestore, 'invoices', order.id), {
          status: 'shipped',
          shippedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          waybillId: waybill || null,
          biteshipStatus: biteshipStatus || null,
          trackingOrderId: biteshipOrderId || null,
          'extra.id': biteshipOrderId || order?.extra?.id || null
        });

        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          status: 'shipped',
          shippedAt: new Date(),
          waybillId: waybill || o.waybillId,
          biteshipStatus: biteshipStatus || o.biteshipStatus,
          trackingOrderId: biteshipOrderId || o.trackingOrderId
        } : o));

        alert('Pesanan ditandai Dikirim.');
      }
    } catch (e) {
      console.error(e);
      try {
        await updateDoc(doc(firestore, 'invoices', order.id), {
          status: 'shipped',
          shippedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'shipped', shippedAt: new Date() } : o));
      } catch {}
      alert('Gagal mengupdate status pengiriman.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
    }
  };

  // PATCH: Print label & auto pindah ke tab Dikirim
  const printLabelAndShip = async (order) => {
    setRowActionId(order.id);
    try {
      const invoiceId = order.id;
      if (!invoiceId) {
        alert('Invoice ID tidak ditemukan.');
        return;
      }
      const resp = await fetch(`/api/biteship/print-label?invoiceId=${invoiceId}`);
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Gagal cetak label.');
        return;
      }
      if (data.label_url) {
        // Update status ke shipped dan inisialisasi counter unduh label
        await updateDoc(doc(firestore, 'invoices', order.id), {
          labelUrl: data.label_url,
          status: 'shipped',
          shippedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          labelDownloadCount: 1
        });
        setOrders(prev => prev.map(o => o.id === order.id ? {
          ...o,
          labelUrl: data.label_url,
          status: 'shipped',
          shippedAt: new Date(),
          labelDownloadCount: 1
        } : o));
        window.open(data.label_url, '_blank');
        setActiveTab('shipped');
      } else {
        alert('Label URL tidak tersedia.');
      }
    } catch (e) {
      alert('Error cetak label.');
    } finally {
      setRowActionId(null);
    }
  };

  // NEW: Unduh Label ulang (untuk tab Dikirim)
  const downloadLabel = async (order) => {
    if (!order) return;
    const currentCount = order.labelDownloadCount || 0;
    if (currentCount >= 1) {
      const proceed = window.confirm(`Label sudah diunduh ${currentCount}x. Lanjutkan unduhan baru? Pastikan tidak double packing.`);
      if (!proceed) return;
    }
    try {
      setRowActionId(order.id);
      setActionLoading(true);
      const invoiceId = order.id;
      if (!invoiceId) { alert('Invoice ID tidak ditemukan.'); return; }
      // Selalu panggil API untuk memastikan signed URL baru (mengatasi label lama yang tokennya sudah expired)
      const resp = await fetch(`/api/biteship/print-label?invoiceId=${encodeURIComponent(invoiceId)}`);
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Gagal mengambil label.');
        return;
      }
      const url = data.label_url || data.url || data.data?.label_url || null;
      if (!url) { alert('Label URL tidak tersedia.'); return; }

      await updateDoc(doc(firestore, 'invoices', order.id), {
        labelUrl: url,
        labelDownloadCount: increment(1),
        updatedAt: serverTimestamp()
      });
      setOrders(prev => prev.map(o => o.id === order.id ? {
        ...o,
        labelUrl: url,
        labelDownloadCount: (o.labelDownloadCount || 0) + 1
      } : o));
      window.open(url, '_blank');
    } catch (e) {
      alert('Error unduh label.');
    } finally {
      setActionLoading(false);
      setRowActionId(null);
    }
  };

  // Product image fallback
  useEffect(() => {
    if (!orders.length) return;
    const cache = productImageCacheRef.current;
    const toFetch = new Set();
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        const pid = it.productId || it.id || it.product_id;
        if (!pid) return;
        if (it.image) return;
        if (cache[pid]) return;
        toFetch.add(pid);
      });
    });
    if (!toFetch.size) return;
    (async () => {
      const entries = await Promise.all(
        Array.from(toFetch).map(async pid => {
          try {
            const snap = await getFirestoreDoc(doc(firestore, 'products', pid));
            if (snap.exists()) {
              const data = snap.data() || {};
              // pick first non-empty url from arrays; supports Cloudinary at later indexes (4,5,6,...)
              let img = null;
              if (Array.isArray(data.images) && data.images.length) {
                img = data.images.find(u => typeof u === 'string' && u.trim()) || null;
              }
              if (!img && typeof data.image === 'string' && data.image.trim()) img = data.image;
              if (!img && Array.isArray(data.gallery) && data.gallery.length) {
                img = data.gallery.find(u => typeof u === 'string' && u.trim()) || null;
              }
              if (!img && typeof data.thumbnail === 'string' && data.thumbnail.trim()) img = data.thumbnail;
              return [pid, img];
            }
          } catch {/* ignore */ }
          return [pid, null];
        })
      );
      let changed = false;
      entries.forEach(([pid, img]) => {
        productImageCacheRef.current[pid] = img || null;
        changed = true;
      });
      if (!changed) return;
      setOrders(prev =>
        prev.map(o => ({
          ...o,
          items: (o.items || []).map(it => {
            if (it.image) return it;
            const pid = it.productId || it.id || it.product_id;
            const cached = pid ? productImageCacheRef.current[pid] : null;
            return cached
              ? { ...it, image: cached }
              : it;
          })
        }))
      );
    })();
  }, [orders]);

  // Handlers to open/close detail modal
  const openDetailModal = (inv) => {
    setDetailInvoice(inv);
    setDetailModalOpen(true);
  };
  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setDetailInvoice(null);
  };

  // Badge style
  const statusBadge = o => {
    // Tentukan style
    const cls = STATUS_STYLE[o.status] || 'bg-slate-100 text-slate-600';

    // Tentukan label dinamis
    let baseLabel = STATUS_LABEL[o.status] || o.status;

    // Kebutuhan khusus:
    // - Jika status 'waiting' & metode COD  => Menunggu Otorisasi COD (sesuai lama)
    // - Jika status 'waiting' & metode selain COD (transfer/VA/QRIS) => Menunggu Konfirmasi Pembayaran
    if (o.status === 'waiting') {
      if (o.paymentMethod === 'cod') {
        baseLabel = 'Menunggu Otorisasi COD';
      } else {
        baseLabel = 'Menunggu Konfirmasi Pembayaran';
      }
    }

    // Jika status 'awaiting_payment' tetap gunakan label default ('Belum Bayar')
    return (
      <span className={`text-xxs uppercase font-semibold px-2 py-[2px] rounded-full ${cls}`}>
        {baseLabel}
      </span>
    );
  };

  // === APPROVE CANCELLATION VIA API (buyer -> cancellation_requested) ===
  const approveCancellationViaAPI = useCallback(async (order) => {
    if (!order) return;
    setCancelSubmitting(true);
    setRowActionId(order.id);
    try {
      const resp = await fetch('/api/biteship/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          invoiceId: order.id,
          reasonCode: 'others',
          reasonText: order.cancellationReason || 'Pembatalan diminta buyer'
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || 'Gagal membatalkan');
      } else {
        // Hapus dari daftar (API sudah arsip + delete)
        setOrders(prev => prev.filter(o => o.id !== order.id));
        setCancelApproveModal(null);
        setCancelSuccessMsg('Order berhasil dibatalkan & dihapus.');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setCancelSubmitting(false);
      setRowActionId(null);
    }
  }, [setOrders]);

  // Auto hide toast sukses
  useEffect(() => {
    if (!cancelSuccessMsg) return;
    const t = setTimeout(() => setCancelSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [cancelSuccessMsg]);

  // === ADD (tracking fetch helper – previously undefined) ===
  const getTrackingId = (order) => {
    return (
      order?.trackingOrderId ||
      order?.biteshipRaw?.id ||
      order?.codOrderId ||
      (order?.extra && order.extra.id) ||
      order?.waybillId || // (waybill biasanya bukan order id tapi fallback)
      null
    );
  };

  // Ambil waybill + courier untuk public tracking
  const getWaybillCourier = (order) => {
    const wb =
      order?.waybillId ||
      order?.biteshipRaw?.courier?.waybill_id ||
      order?.codOrderId ||
      order?.trackingOrderId;
    const cc =
      order?.shippingSelection?.courier ||
      order?.biteshipRaw?.courier?.company;
    return { waybill: wb, courier: cc };
  };

  const fetchTrackingForOrder = useCallback(async (order, silent = true) => {
    if (!order || order.status !== 'shipped') return;
    let { waybill, courier } = getWaybillCourier(order);

    // Instant kurir: (HANYA retrieve bila BUKAN di tab 'shipped')
    if (['grab','gojek'].includes((courier||'').toLowerCase()) && !waybill) {
      if (activeTab !== 'shipped') {
        const ro = await fetch(`/api/biteship/retrieve-order?invoiceId=${encodeURIComponent(order.id)}`);
        const rData = await ro.json();
        if (ro.ok && (rData.waybill || rData.waybill_id)) {
          waybill = rData.waybill || rData.waybill_id;
          await updateDoc(doc(firestore, 'invoices', order.id), {
            waybillId: waybill,
            biteshipStatus: rData.biteshipStatus || rData.data?.status || null,
            updatedAt: serverTimestamp()
          });
          setOrders(p => p.map(o => o.id===order.id ? {
            ...o,
            waybillId: waybill,
            biteshipStatus: rData.biteshipStatus || rData.data?.status || o.biteshipStatus
          } : o));
          order = { ...order, waybillId: waybill };
        } else {
          if (!silent) alert('Waybill belum tersedia, coba lagi nanti.');
          return;
        }
      } else {
        // Di tab Dikirim: tidak melakukan retrieve, langsung berhenti
        if (!silent) alert('Waybill belum tersedia (instant). Menunggu pickup. Tidak melakukan retrieve di tab Dikirim.');
        return;
      }
    }

    let { waybill: finalWaybill, courier: finalCourier } = getWaybillCourier(order);
    if (!finalWaybill || !finalCourier) return;

    try {
      if (!silent) {
        setOrders(p => p.map(o => o.id===order.id ? { ...o, trackingLoading:true } : o));
      }

      const q = `/api/biteship/track?invoiceId=${encodeURIComponent(order.id)}&waybill=${encodeURIComponent(finalWaybill)}&courier=${encodeURIComponent(finalCourier)}&t=${Date.now()}`;
      const resp = await fetch(q);
      const data = await resp.json();

      if (!resp.ok) {
        setOrders(p => p.map(o => o.id===order.id ? { ...o, trackingLoading:false } : o));
        return;
      }

      const tracking = data.tracking;
      const rawStatus = (tracking?.status || '').toLowerCase();

      const updFields = {};
      if (tracking?.waybill_id && !order.waybillId) updFields.waybillId = tracking.waybill_id;
      if (tracking?.id && !order.trackingOrderId) updFields.trackingOrderId = tracking.id;
      if (Object.keys(updFields).length) {
        await updateDoc(doc(firestore, 'invoices', order.id), updFields);
        setOrders(p => p.map(o => o.id===order.id ? { ...o, ...updFields } : o));
        order = { ...order, ...updFields };
      }

      const events = Array.isArray(tracking?.histories) ? tracking.histories
                    : Array.isArray(tracking?.history) ? tracking.history
                    : [];
      let lastEvent = null;
      if (events.length) {
        lastEvent = events.reduce((acc, ev) => {
          const t = new Date(ev.updated_at || ev.eventDate || ev.created_at || 0).getTime();
          if (!acc) return ev;
          const accT = new Date(acc.updated_at || acc.eventDate || acc.created_at || 0).getTime();
          return t > accT ? ev : acc;
        }, null);
      }
      const checkpoint = lastEvent
        ? (lastEvent.status || lastEvent.note || lastEvent.description || '')
        : '';

      setOrders(p => p.map(o => o.id===order.id ? {
        ...o,
        biteshipStatus: tracking?.status || o.biteshipStatus,
        trackingCheckpoint: checkpoint,
        trackingUpdatedAt: new Date(),
        trackingCourier: finalCourier,
        trackingLoading: false
      } : o));

      const finalMap = {
        delivered: 'completed',
        completed: 'completed',
        returned: 'returned',
        cancelled: 'cancelled',
        rejected: 'cancelled',
        couriernotfound: 'cancelled',
        disposed: 'cancelled'
      };

      if (finalMap[rawStatus] && order.status !== finalMap[rawStatus]) {
        await updateDoc(doc(firestore, 'invoices', order.id), {
          status: finalMap[rawStatus],
          biteshipStatus: tracking?.status,
          updatedAt: serverTimestamp(),
          ...(finalMap[rawStatus]==='completed' ? { completedAt: serverTimestamp() } : {})
        });
        setOrders(p => p.map(o => o.id===order.id ? { ...o, status: finalMap[rawStatus] } : o));
      }
    } catch {
      setOrders(p => p.map(o => o.id===order.id ? { ...o, trackingLoading:false } : o));
    }
  }, [activeTab]); // <== tambahkan activeTab dependency

  // -- UI based on Shopee style: Tabs above, search, sort, courier filter, table --
  if (!authReady || !adminChecked) return null;
  if (!isAdmin) return <div className="p-6 text-center text-sm text-gray-500">Akses ditolak.</div>;

  return (
    <AdminLayout title="Orders">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="flex items-center px-4 py-2">
          <button
            className="mr-2 text-orange-600 font-bold text-lg"
            onClick={() => router.back()}
            title="Kembali"
          >
            &#8592;
          </button>
          <span className="font-bold text-gray-800 text-lg">Penjualan Saya</span>
          <div className="flex-1" />
          <button className="mr-2 text-orange-500" title="Search">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" strokeWidth={2} />
              <path d="M21 21l-4.35-4.35" strokeWidth={2} />
            </svg>
          </button>
          <button className="text-orange-500" title="Chat">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14l4-4h12a2 2 0 002-2z" strokeWidth={2} />
            </svg>
          </button>
        </div>
        {/* Main Tabs */}
        <div className="flex px-2 border-b">
          {MAIN_TABS.map(tab => {
            const active = activeTab===tab.key;
            const isCancelTab = tab.key === 'cancelled';
            return (
              <button
                key={tab.key}
                className={`relative flex-1 py-3 font-medium text-sm border-b-2 ${active?'border-orange-500 text-orange-600':'border-transparent text-gray-600'} transition duration-75`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                {isCancelTab && cancelReqCount > 0 && (
                  <span className="absolute -top-1 right-3 bg-red-600 text-white text-[10px] font-semibold px-2 py-[1px] rounded-full shadow">
                    {cancelReqCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Filter/sort bar */}
        <div className="flex flex-wrap gap-2 px-2 py-2 bg-white border-b">
          <select
            value={sortOption}
            onChange={e => setSortOption(e.target.value)}
            className="px-2 py-1 text-xs border rounded text-orange-600"
          >
            <option value="createdAt">Urutkan Tanggal Pesanan Siap...</option>
            <option value="updatedAt">Urutkan Tanggal Update...</option>
            <option value="grandTotal">Urutkan Total...</option>
          </select>
          <select
            value={courierFilter}
            onChange={e => setCourierFilter(e.target.value)}
            className="px-2 py-1 text-xs border rounded text-orange-600"
          >
            <option value="">Jasa Kirim Semua</option>
            <option value="jne">JNE</option>
            <option value="jnt">J&T</option>
            <option value="tiki">TIKI</option>
            <option value="sicepat">SiCepat</option>
            <option value="gojek">Gojek</option>
            <option value="grab">Grab</option>
          </select>
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="px-2 py-1 text-xs border rounded text-orange-600"
          >
            <option value="">Metode Semua</option>
            <option value="cod">COD</option>
            <option value="prepaid">Transfer</option>
          </select>
          <input
            placeholder="Cari invoice / buyer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1 text-xs border rounded bg-white w-40 text-orange-600"
          />
          <button
            onClick={() => liveMode ? setLiveMode(false) : fetchPage(true)}
            className="px-3 py-1 text-xs border rounded text-orange-500 bg-white hover:bg-orange-50"
          >
            {liveMode ? 'Matikan Realtime' : 'Mode Realtime'}
          </button>
          {!liveMode && (
            <button
              onClick={() => fetchPage(false)}
              className="px-3 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={loading || !more}
            >
              {loading ? 'Memuat...' : more ? 'Muat Lebih' : 'Selesai'}
            </button>
          )}
          {activeTab === 'packed' && (
            <button
              onClick={exportPackedToExcel}
              className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
              title="Download Excel (Perlu Dikirim)"
            >
              Download Excel
            </button>
          )}
          {indexError && (
            <a
              href={indexError}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-red-600 underline"
            >
              Buat Index &gt;
            </a>
          )}
        </div>
      </div>

      {permError && (
        <div className="w-full mb-4 px-4 py-2 text-xs rounded bg-red-50 text-red-600 border border-red-200">
          {permError} {isAdmin ? '' : ' (Anda bukan admin)'}
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-2">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Invoice</th>
                <th className="px-3 py-2 text-left font-semibold">Buyer</th>
                <th className="px-3 py-2 text-left font-semibold">Items</th>
                <th className="px-3 py-2 text-left font-semibold">Totals</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(o => {
                const cod = o.paymentMethod === 'cod';
                const statusCls = STATUS_STYLE[o.status] || 'bg-slate-100 text-slate-600';
                const items = o.items || [];
                const preview = items.slice(0, 3);
                const extra = items.length - preview.length;
                return (
                    <tr key={o.id}
                      className={`hover:bg-gray-50 align-top ${o.status==='cancellation_requested' ? 'bg-amber-50/70' : ''} ${activeTab==='shipped' && (o.labelDownloadCount||0)>1 ? 'bg-yellow-50/70' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-[11px]">#{o.invoiceId || o.id}</div>
                      <div className="mt-1 text-[10px] text-gray-500 flex flex-col gap-[2px]">
                        <span>Created: {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : '-'}</span>
                        <span>Updated: {o.updatedAt?.toDate ? o.updatedAt.toDate().toLocaleString() : '-'}</span>
                        {o.shippingSelection && (
                          <span>
                            {o.shippingSelection.courier?.toUpperCase()} {o.shippingSelection.service_name} · Rp {(o.shippingSelection.price||0).toLocaleString('id-ID')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-[11px] font-medium">{o.buyerName || '-'}</div>
                      <div className="text-[10px] text-gray-500">{o.buyerPhone || ''}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1 min-w-[200px]">
                        {preview.map((it, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Image
                              src={
                                (typeof it.image === 'string' && it.image.trim() ? it.image : null) ||
                                (Array.isArray(it.images)
                                  ? (it.images.find(u => typeof u === 'string' && u.trim()) || null)
                                  : (typeof it.images === 'string' && it.images.trim() ? it.images : null)
                                ) ||
                                productImageCacheRef.current[it.productId || it.id || it.product_id] ||
                                '/no-image.png'
                              }
                              alt={it.name}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded object-cover border"
                              priority
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-medium">{it.name}</div>
                              <div className="text-[10px] text-gray-500">
                                Qty {it.quantity} · Rp {(it.price || 0).toLocaleString('id-ID')}
                              </div>
                            </div>
                          </div>
                        ))}
                        {extra > 0 && (
                          <div className="text-[10px] text-gray-500">
                            +{extra} item lainnya
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-[10px] text-gray-500">
                        Subtotal: Rp {(o.subtotal||0).toLocaleString('id-ID')}
                      </div>
                      {o.codFee > 0 && (
                        <div className="text-[10px] text-gray-500">
                          COD Fee: Rp {o.codFee.toLocaleString('id-ID')}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500">
                        Ongkir: Rp {(o.shippingCost||0).toLocaleString('id-ID')}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-gray-800">
                        Total: Rp {(o.grandTotal || o.subtotal || 0).toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-block px-2 py-[3px] rounded-full text-[10px] font-semibold ${statusCls}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                        {/* COD waiting info */}
                        {o.status === 'waiting' && (
                          o.paymentMethod === 'cod' ? (
                            <div className="text-[10px] text-orange-600 font-medium">
                              Menunggu approval COD
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-600 font-medium">
                              Menunggu konfirmasi pembayaran
                            </div>
                          )
                        )}
                        {/* === NEW: Tracking info tampil di tab Dikirim (status shipped) === */}
                        {activeTab === 'shipped' && o.status === 'shipped' && (
                          <div className="mt-1 p-2 rounded bg-indigo-50 border border-indigo-100 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-medium text-indigo-700">
                                Tracking: {o.biteshipStatus || '—'}
                              </span>
                              <button
                                onClick={() => fetchTrackingForOrder(o, false)}
                                disabled={o.trackingLoading}
                                title="Refresh tracking"
                                className="text-[10px] px-2 py-[2px] rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                {o.trackingLoading ? '...' : '↻'}
                              </button>
                            </div>
                            {o.biteshipStatus && (
                              <div className="text-[9px] text-gray-600 leading-snug">
                                {BITESHIP_STATUS_DESC[o.biteshipStatus] || ''}
                              </div>
                            )}
                            {o.trackingCheckpoint && (
                              <div className="text-[9px] text-gray-500 italic line-clamp-2">
                                {o.trackingCheckpoint}
                              </div>
                            )}
                            {o.trackingUpdatedAt && (
                              <div className="text-[8px] text-gray-400">
                                {`Upd: ${
                                  o.trackingUpdatedAt instanceof Date
                                    ? o.trackingUpdatedAt.toLocaleTimeString()
                                    : (o.trackingUpdatedAt?.toDate
                                        ? o.trackingUpdatedAt.toDate().toLocaleTimeString()
                                        : '')
                                }`}
                              </div>
                            )}
                            {o.waybillId && (
                              <div className="text-[8px] text-indigo-500 break-all">
                                Waybill: {o.waybillId}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-[3px] rounded-full text-[10px] font-medium ${cod ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>
                        {cod ? 'COD' : 'Transfer'}
                      </span>
                      {o.codOrderId && (
                        <div className="mt-1 text-[9px] text-fuchsia-600 font-medium">
                          Waybill: {o.waybillId || o.codOrderId.slice(0,8)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 min-w-[180px]">
                      <div className="flex flex-col gap-2">
                        {/* Detail popup */}
                        <button
                          onClick={() => openDetailModal(o)}
                          className="px-2 py-1 text-[10px] rounded bg-primary text-white hover:bg-blueDark"
                        >
                          Detail
                        </button>
                        {activeTab === 'shipped' && (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => downloadLabel(o)}
                              disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                              className={`px-2 py-1 text-[10px] rounded text-white disabled:opacity-40 ${((o.labelDownloadCount||0) > 3) ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                              {rowActionId === o.id && actionLoading ? 'Menyiapkan…' : 'Unduh Label'}
                              {(o.labelDownloadCount||0) >= 3 && (
                                <span className={`ml-2 inline-flex items-center px-1.5 py-[1px] rounded text-[9px] font-semibold ${((o.labelDownloadCount||0) > 3) ? 'bg-white text-red-700' : 'bg-white/20 text-white'}`}>
                                  {(o.labelDownloadCount||0)}x
                                </span>
                              )}
                            </button>
                            {typeof o.labelDownloadCount === 'number' && (
                              <div className={`text-[9px] ${o.labelDownloadCount>1 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                Diunduh {o.labelDownloadCount}x{o.labelDownloadCount>1 ? ' · Periksa agar tidak double packing' : ''}
                              </div>
                            )}
                          </div>
                        )}
                        {/* ================= ACTIONS PER TAB ================= */}
                        {activeTab === 'awaiting_payment' && (
                          <>
                            {/* Approve COD */}
                            {!COD_DISABLED && cod && o.status === 'waiting' && !o.codOrderId && (
                              <button
                                onClick={() => setPendingAction({ type: 'approveCod', order: o })}
                                disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
                              >
                                {rowActionId === o.id && actionLoading ? 'Proses...' : 'Approve COD'}
                              </button>
                            )}

                            {/* Pengingat pembayaran */}
                            {(!cod || o.status !== 'waiting') && (
                              <button
                                onClick={() => sendPaymentReminder(o)}
                                disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40"
                              >
                                Kirim Pengingat
                              </button>
                            )}

                            {/* Ubah status (disable saat COD menunggu approval) */}
                            <select
                              className="border rounded px-2 py-1 text-[10px] bg-white disabled:opacity-40"
                              value={o.status}
                              onChange={e => setPendingAction({ type: 'status', order: o, next: e.target.value })}
                              disabled={(rowActionId && rowActionId !== o.id) || (cod && o.status === 'waiting') || actionLoading}
                            >
                              {STATUS_OPTIONS.map(s => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          </>
                        )}

                        {activeTab === 'packed' && (
                          <>
                            {/* Buat Kiriman (shipment) jika belum ada */}
                            {o.paymentMethod !== 'cod' && !o.biteshipOrderId && (
                              <button
                                onClick={() => createShipment(o)}
                                disabled={(rowActionId && rowActionId !== o.id) || !['paid','packed'].includes(o.status) || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40"
                              >
                                {rowActionId === o.id && actionLoading ? 'Proses...' : 'Buat Kiriman'}
                              </button>
                            )}

                            {/* Cetak Label & Kirim jika sudah ada shipment */}
                            {((o.paymentMethod !== 'cod' && o.biteshipOrderId) || o.paymentMethod === 'cod') && (
                              <button
                                onClick={() => printLabelAndShip(o)}
                                disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                {rowActionId === o.id && actionLoading ? 'Memproses...' : 'Cetak Label & Kirim'}
                              </button>
                            )}

                            {/* Batalkan Order */}
                            <button
                              onClick={() => setCancelPackedModal(o)}
                              disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                              className="px-2 py-1 text-[10px] rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                            >
                              {rowActionId === o.id && actionLoading ? 'Memproses...' : 'Batalkan Order'}
                            </button>
                          </>
                        )}

                        {activeTab !== 'awaiting_payment' && activeTab !== 'packed' && (
                          <>
                            <select
                              className="border rounded px-2 py-1 text-[10px] bg-white disabled:opacity-40"
                              value={o.status}
                              onChange={e => setPendingAction({ type: 'status', order: o, next: e.target.value })}
                              disabled={(rowActionId && rowActionId !== o.id) || (o.status === 'waiting' && cod) || actionLoading}
                            >
                              {STATUS_OPTIONS.map(s => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                            {!COD_DISABLED && cod && o.status === 'waiting' && !o.codOrderId && (
                              <button
                                onClick={() => setPendingAction({ type: 'approveCod', order: o })}
                                disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
                              >
                                {rowActionId === o.id && actionLoading ? 'Proses...' : 'Approve COD'}
                              </button>
                            )}
                            <div className="flex flex-wrap gap-1">
                              <button
                                onClick={() => setPendingAction({ type: 'cancel', order: o })}
                                disabled={(rowActionId && rowActionId !== o.id) || o.status === 'cancelled' || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setPendingAction({ type: 'return', order: o })}
                                disabled={(rowActionId && rowActionId !== o.id) || o.status === 'returned' || o.status === 'cancelled' || actionLoading}
                                className="px-2 py-1 text-[10px] rounded bg-pink-50 text-pink-600 hover:bg-pink-100 disabled:opacity-40"
                              >
                                Retur
                              </button>
                              {activeTab === 'cancelled' && o.status === 'cancellation_requested' && (
                                <>
                                  <button
                                    onClick={() => setCancelApproveModal(o)}
                                    disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                    className="px-2 py-1 text-[10px] rounded bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 disabled:opacity-40"
                                  >
                                    Setujui
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Tolak -> kembalikan ke previousStatus atau packed
                                      doUpdateStatus(o, o.previousStatus || 'packed');
                                    }}
                                    disabled={(rowActionId && rowActionId !== o.id) || actionLoading}
                                    className="px-2 py-1 text-[10px] rounded bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700 hover:from-gray-400 hover:to-gray-500 disabled:opacity-40"
                                  >
                                    Tolak
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {orders.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[12px] text-gray-500">
                    Tidak ada order.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-[12px] text-gray-500">
                    Memuat...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !actionLoading && setPendingAction(null)}
          />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
              <h3 className="font-semibold text-sm">
                {pendingAction.type === 'status' && 'Ubah Status Order'}
                {pendingAction.type === 'cancel' && 'Konfirmasi Pembatalan'}
                {pendingAction.type === 'return' && 'Konfirmasi Retur'}
                {pendingAction.type === 'approveCod' && 'Approve COD'}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Invoice #{pendingAction.order.invoiceId || pendingAction.order.id}<br />
                Status saat ini: {STATUS_LABEL[pendingAction.order.status] || pendingAction.order.status}
                {pendingAction.type === 'status' && (
                  <>
                    <br />Menjadi:{' '}
                    <span className="font-medium">
                      {STATUS_LABEL[pendingAction.next] || pendingAction.next}
                    </span>
                  </>
                )}
                {pendingAction.type === 'approveCod' && (
                  <>
                    <br />Aksi ini akan membuat order COD ke Biteship dan mengubah status ke Dikemas.
                  </>
                )}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  disabled={actionLoading}
                  onClick={() => setPendingAction(null)}
                  className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Batal
                </button>
                {pendingAction.type === 'status' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => doUpdateStatus(pendingAction.order, pendingAction.next)}
                    className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Simpan
                  </button>
                )}
                {pendingAction.type === 'cancel' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => doCancel(pendingAction.order)}
                    className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Batalkan
                  </button>
                )}
                {pendingAction.type === 'return' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => doReturn(pendingAction.order)}
                    className="px-3 py-1 text-xs rounded bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50"
                  >
                    Retur
                  </button>
                )}
                {pendingAction.type === 'approveCod' && (
                  <button
                    disabled={actionLoading}
                    onClick={() => approveCOD(pendingAction.order)}
                    className="px-3 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
        </div>
      )}

      {/* Modal approve pembatalan */}
      {cancelApproveModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
             onClick={() => !cancelSubmitting && setCancelApproveModal(null)} />
           <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
             <h3 className="font-semibold text-sm">Setujui Pembatalan</h3>
             <div className="text-xs text-gray-600 space-y-2">
               <p>
                 Invoice #{cancelApproveModal.invoiceId || cancelApproveModal.id}
               </p>
               <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px]">
                 <span className="font-semibold block mb-1 text-amber-700">Alasan Buyer:</span>
                 {cancelApproveModal.cancellationReason || '- (tidak diisi)'}
               </div>
               <p className="text-[10px] text-gray-500">
                 Klik Batalkan untuk mengirim pembatalan ke Biteship (reasonCode: others) dan menghapus invoice.
               </p>
             </div>
             <div className="flex justify-end gap-2">
               <button
                 disabled={cancelSubmitting}
                 onClick={() => setCancelApproveModal(null)}
                 className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
               >
                 Tutup
               </button>
               <button
                 disabled={cancelSubmitting}
                 onClick={async () => {
                   // Approve -> batalkan di Biteship + set status cancelled
                   setCancelSubmitting(true);
                   try {
                     const order = cancelApproveModal;

                     // 1. Batalkan ke Biteship (abaikan error kalau tidak bisa)
                     await fetch('/api/biteship/cancel-order', {
                       method:'POST',
                       headers:{'Content-Type':'application/json'},
                       body: JSON.stringify({
                         invoiceId: order.id,
                         reasonCode: 'others',
                         reasonText: order.cancellationReason || 'Pembatalan diminta buyer'
                       })
                     }).catch(()=>{});

                     // 2. Update invoice -> cancelled
                     await updateDoc(doc(firestore,'invoices', order.id), {
                       status: 'cancelled',
                       updatedAt: serverTimestamp(),
                       refundVoucherIssuedAt: serverTimestamp()
                     });

                     // 3. Buat voucher refund
                     const voucherResult = await createRefundVoucherForInvoice(firestore, order);

                     // 4. Update state lokal
                     setOrders(prev => prev.map(o => o.id===order.id ? { ...o, status:'cancelled' } : o));
                     setCancelApproveModal(null);

                     let msg = 'Order dibatalkan.';
                     if (voucherResult?.success) {
                       msg += ` Voucher refund dibuat: ${voucherResult.code} (Rp ${voucherResult.amount.toLocaleString('id-ID')}).`;
                     } else if (voucherResult?.skipped) {
                       msg += ` (Voucher dilewati: ${voucherResult.reason}).`;
                     } else if (voucherResult?.error) {
                       msg += ' (Gagal membuat voucher refund.)';
                     }
                     setCancelSuccessMsg(msg);
                   } catch (e) {
                     alert('Gagal menyetujui: '+e.message);
                   } finally {
                     setCancelSubmitting(false);
                   }
                 }}
                 className="px-4 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
               >
                 {cancelSubmitting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                 Batalkan
               </button>
             </div>
           </div>
         </div>
       )}

      {/* Modal konfirmasi batal di tab Perlu Dikirim */}
      {cancelPackedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !actionLoading && setCancelPackedModal(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-semibold text-sm">Konfirmasi Pembatalan (Perlu Dikirim)</h3>
            <div className="text-xs text-gray-600 space-y-2">
              <p>
                Anda akan membatalkan dan menghapus invoice #
                {cancelPackedModal.invoiceId || cancelPackedModal.id}.
              </p>
              <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px]">
                Tindakan ini permanen dan tidak dapat dibatalkan.
              </div>
              <p className="text-[10px] text-gray-500">
                Sistem akan memanggil API Biteship cancel (jika ada order terdaftar) lalu menghapus dokumen invoice.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                disabled={actionLoading}
                onClick={() => setCancelPackedModal(null)}
                className="px-3 py-1 text-xs rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Tutup
              </button>
              <button
                disabled={actionLoading}
                onClick={() => cancelPackedOrder(cancelPackedModal)}
                className="px-4 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup sukses */}
      {cancelSuccessMsg && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white text-xs px-4 py-2 rounded shadow-lg">
          {cancelSuccessMsg}
        </div>
      )}

      {/* Modal Detail Invoice (Admin) */}
      {detailModalOpen && detailInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDetailModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border">
            <h4 className="text-sm font-semibold text-gray-800 mb-1">Detail Invoice</h4>
            <div className="mb-2 text-xs text-gray-700">
              <div className="font-semibold">{detailInvoice.buyerName || '-'}</div>
              <div>{detailInvoice.shippingAddress?.address || detailInvoice.destination?.address || '-'}</div>
              <div>
                {(detailInvoice.shippingAddress?.city || detailInvoice.destination?.city || '')}
                {' '}
                {(detailInvoice.shippingAddress?.postal_code || detailInvoice.destination?.postal_code || '')}
              </div>
              <div>{detailInvoice.shippingAddress?.province || detailInvoice.destination?.province || ''}</div>
              <div className="mt-2 text-gray-500">Invoice: {detailInvoice.invoiceId || detailInvoice.id}</div>
            </div>
            <div className="mb-2">
              {(detailInvoice.items || []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 border-b py-2 last:border-b-0">
                  <Image
                    src={
                      (typeof item.image === 'string' && item.image.trim() ? item.image : null) ||
                      (Array.isArray(item.images)
                        ? (item.images.find(u => typeof u === 'string' && u.trim()) || null)
                        : (typeof item.images === 'string' && item.images.trim() ? item.images : null)
                      ) ||
                      productImageCacheRef.current[item.productId || item.id || item.product_id] ||
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
              {detailInvoice.transferFee > 0 && (
                <div className="flex justify-between mb-1">
                  <span>Transfer Fee</span>
                  <span>Rp {Number(detailInvoice.transferFee).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-blueDark mt-2">
                <span>Total</span>
                <span>Rp {Number(detailInvoice.grandTotal || detailInvoice.amount || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
            <button
              onClick={closeDetailModal}
              className="mt-3 w-full px-4 py-2 text-xs rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 font-medium"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Popup error window instant */}
      {instantTimeError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={()=> setInstantTimeError(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4 border border-amber-200">
            <h3 className="font-semibold text-sm text-amber-700">Jam Operasional Kurir Instant</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {instantTimeError}
            </p>
            <div className="flex justify-end">
              <button
                onClick={()=> setInstantTimeError(null)}
                className="px-3 py-1 text-xs rounded bg-amber-600 text-white hover:bg-amber-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable popup (letakkan sebelum return / di bagian modal popup lain): */}
      {itemCategoryError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setItemCategoryError(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4 border border-red-200">
            <h3 className="font-semibold text-sm text-red-700">Kategori Item Tidak Valid</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {itemCategoryError}<br /><br />
              Sistem otomatis akan mengganti kategori tidak dikenal menjadi &quot;others&quot; pada percobaan berikutnya.
            </p>
            <div className="flex justify-end">
              <button
                onClick={()=>setItemCategoryError(null)}
                className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast permintaan pembatalan baru */}
      {cancelReqToast && (
        <div className="fixed bottom-4 left-4 z-50 bg-amber-600 text-white text-xs px-4 py-2 rounded shadow-lg animate-fadeIn">
          {cancelReqToast}
        </div>
      )}
    </AdminLayout>
  );
}