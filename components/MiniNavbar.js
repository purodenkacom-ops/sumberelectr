import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore } from '@/utils/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { FaArrowLeft } from 'react-icons/fa';

function getBackInfo(referrer) {
  if (!referrer) return { label: 'Beranda', href: '/' };
  try {
    const url = new URL(referrer);
    const path = url.pathname;

    if (path === '/' || path === '') return { label: 'Beranda', href: '/' };
    if (path.startsWith('/category/')) {
      const parts = path.split('/').filter(Boolean);
      // /category/[cat] atau /category/[cat]/[subcat]
      const catSlug = parts[1] || '';
      const subSlug = parts[2] || '';
      const label = subSlug
        ? decodeURIComponent(subSlug).replace(/-/g, ' ')
        : decodeURIComponent(catSlug).replace(/-/g, ' ');
      return {
        label: toTitleCase(label),
        href: path,
      };
    }
    if (path.startsWith('/search')) {
      return { label: 'Hasil Pencarian', href: referrer.replace(url.origin, '') };
    }
    if (path.startsWith('/all-product')) {
      return { label: 'Semua Produk', href: path };
    }
    return { label: 'Kembali', href: path };
  } catch {
    return { label: 'Beranda', href: '/' };
  }
}

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

export default function MiniNavbar({ backUrl, backLabel }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [userId, setUserId] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [backInfo, setBackInfo] = useState({ label: backLabel || 'Beranda', href: backUrl || '/' });

  // Baca referrer saat mount (client-side only) jika tidak ada backUrl eksplisit
  useEffect(() => {
    if (backUrl) return; // Gunakan props jika ada
    const stored = sessionStorage.getItem('productReferrer');
    if (stored) {
      setBackInfo(getBackInfo(stored));
    } else if (typeof document !== 'undefined' && document.referrer) {
      // Hanya pakai referrer jika berasal dari domain yang sama
      try {
        const refUrl = new URL(document.referrer);
        const curUrl = new URL(window.location.href);
        if (refUrl.hostname === curUrl.hostname) {
          setBackInfo(getBackInfo(document.referrer));
          sessionStorage.setItem('productReferrer', document.referrer);
        }
      } catch {}
    }
  }, [backUrl]);

  // Simpan referrer setiap kali route berubah (sebelum pergi ke halaman produk)
  useEffect(() => {
    const handleRouteChange = (url) => {
      if (url.startsWith('/product/')) {
        sessionStorage.setItem('productReferrer', window.location.href);
      }
    };
    router.events.on('beforeHistoryChange', handleRouteChange);
    return () => router.events.off('beforeHistoryChange', handleRouteChange);
  }, [router.events]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      if (u) setUserId(u.uid);
      else {
        setUserId(null);
        setCartCount(0);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const cartRef = doc(firestore, 'carts', userId);
    const unsub = onSnapshot(cartRef, snap => {
      if (!snap.exists()) { setCartCount(0); return; }
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      const distinct = new Set(
        items
          .filter(it => (it?.quantity || 0) > 0)
          .map(it => it.productId || it.id || it.name || JSON.stringify(it))
      ).size;
      setCartCount(distinct);
    });
    return () => unsub();
  }, [userId]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleBack = () => {
    // Bersihkan referrer saat kembali
    sessionStorage.removeItem('productReferrer');
    router.push(backInfo.href);
  };

  const goCart = () => {
    if (userId) router.push(`/cart/${userId}`);
    else {
      if (typeof window !== 'undefined') localStorage.setItem('redirectAfterLogin', '/cart/temp');
      router.push('/login');
    }
  };

  return (
    <div className="mb-6 flex flex-row gap-3 items-stretch sm:items-center">
      <button
        type="button"
        onClick={handleBack}
        className="group inline-flex items-center gap-2 px-4 h-11 rounded-full bg-white/80 backdrop-blur border border-red-100 shadow hover:shadow-md hover:bg-white transition text-sm font-medium text-primary hover:text-blueDark max-w-[160px] sm:max-w-none"
        aria-label={`Kembali ke ${backInfo.label}`}
      >
        <span className="relative flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-blueLight to-primary text-white shadow-inner">
          <FaArrowLeft className="text-xs" />
        </span>
        <span className="tracking-wide truncate hidden sm:inline">{backInfo.label}</span>
      </button>

      <div className="flex-1 flex items-center gap-3">
        <form
          onSubmit={submitSearch}
          className="flex-1 flex h-11 rounded-full bg-white/80 backdrop-blur border border-red-100 shadow focus-within:ring-2 focus-within:ring-blueLight/40 transition overflow-hidden"
          role="search"
          aria-label="Pencarian produk"
        >
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari produk lain..."
            className="flex-1 px-4 text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          <button
            type="submit"
            className="px-5 flex items-center justify-center text-white bg-gradient-to-r from-blueLight to-primary hover:from-primary hover:to-blueDark focus:outline-none"
            aria-label="Cari"
          >
            <FontAwesomeIcon icon={faSearch} />
            <span className="sr-only">Cari</span>
          </button>
        </form>

        <button
          type="button"
          onClick={goCart}
          className="relative inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/80 border border-gray-100 shadow hover:shadow-md text-primary hover:text-blueDark"
          aria-label="Keranjang"
        >
          <FontAwesomeIcon icon={faCartShopping} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-[4px] rounded-full bg-primary text-[10px] text-white flex items-center justify-center font-bold">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
