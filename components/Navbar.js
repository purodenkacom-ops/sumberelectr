import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { FaWhatsapp } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import TransactionMarquee from './TransactionMarquee';

const Navbar = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [alamat, setAlamat] = useState('Mendeteksi lokasi...');
  const [loadingLoc, setLoadingLoc] = useState(true);

  const [userId, setUserId] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [buyerName, setBuyerName] = useState('');
  const [hideGeo, setHideGeo] = useState(false);

  const fixedRef = useRef(null);
  const [navHeight, setNavHeight] = useState(96);

  // Sync user from AuthContext
  useEffect(() => {
    if (user) {
      const uid = user.id || user.uid;
      setUserId(uid);
      const bn = user.profile?.name || user.name || user.email?.split('@')[0] || 'User';
      setBuyerName(bn);
    } else {
      setUserId(null);
      setBuyerName('');
      setCartCount(0);
    }
  }, [user]);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude: lat, longitude: lng } = pos.coords;
            const url = `/api/geo/reverse?lat=${lat}&lon=${lng}`;
            const res = await fetch(url);
            const data = await res.json();
            setAlamat(data.display_name || 'Alamat tidak ditemukan');
          } catch {
            setAlamat('Gagal mengambil alamat');
          } finally {
            setLoadingLoc(false);
          }
        },
        () => {
          setAlamat('Gagal mendeteksi lokasi');
          setLoadingLoc(false);
        }
      );
    } else {
      setAlamat('Geolocation tidak didukung');
      setLoadingLoc(false);
    }
  }, []);

  // Cart count from Supabase
  useEffect(() => {
    if (!userId) {
      setCartCount(0);
      return;
    }
    let isMounted = true;
    async function loadCartCount() {
      try {
        const { data } = await supabase
          .from('carts')
          .select('items')
          .eq('user_id', userId)
          .maybeSingle();

        if (!isMounted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        const distinct = new Set(
          items
            .filter((it) => (it?.quantity || 0) > 0)
            .map((it) => it.productId || it.id || it.name || JSON.stringify(it))
        ).size;
        setCartCount(distinct);
      } catch (err) {
        console.warn('Navbar cart fetch error:', err);
      }
    }

    loadCartCount();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Hide geolocation when scroll
  useEffect(() => {
    if (!userId) {
      setHideGeo(false);
      return;
    }
    const isHome = router.pathname === '/';
    if (!isHome) {
      setHideGeo(false);
      return;
    }
    const onScroll = () => {
      const y = window.scrollY || 0;
      setHideGeo(y > 20);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [router.pathname, userId]);

  // Update nav height dynamically
  useEffect(() => {
    const updateH = () => {
      const h = fixedRef.current?.offsetHeight || 96;
      setNavHeight(h);
    };
    updateH();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateH) : null;
    if (ro && fixedRef.current) ro.observe(fixedRef.current);
    window.addEventListener('resize', updateH);
    return () => {
      window.removeEventListener('resize', updateH);
      if (ro && fixedRef.current) ro.unobserve(fixedRef.current);
    };
  }, [buyerName, alamat, hideGeo]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  };

  const goCart = () => {
    if (userId) router.push(`/cart/${userId}`);
    else {
      localStorage.setItem('redirectAfterLogin', '/cart/temp');
      router.push('/login');
    }
  };

  const goWhatsApp = async () => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const msg = `Halo Admin, saya butuh bantuan/pesan produk. (Halaman: ${currentUrl})`;
    let number = process.env.NEXT_PUBLIC_ADMIN_WA || '6281234567890';
    try {
      const r = await fetch('/api/whatsapp/next');
      const data = await r.json();
      if (data?.number) number = data.number;
    } catch {}
    const waLink = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
    if (typeof window !== 'undefined') window.open(waLink, '_blank');
  };

  return (
    <div>
      <div ref={fixedRef} className="fixed top-0 w-full bg-white z-50 shadow-lg">
        <div className="flex flex-col px-4 pt-3 pb-0">
          {/* Lokasi */}
          <div className="flex flex-row items-center justify-between mb-2">
            <div>
              {!userId && (
                <div className="text-sm font-semibold text-gray-900">
                  Lokasi Anda
                </div>
              )}
              {userId && (
                <div className="text-xs font-medium text-primary mb-[2px]">
                  Halo {buyerName ? buyerName.split(' ')[0] : 'Sobat'}, siap belanja kebutuhan listrik hari ini?
                </div>
              )}
              <div
                className={`text-xs text-gray-600 flex items-center transition-all duration-300 will-change-transform
                ${userId && hideGeo ? 'max-h-0 opacity-0 -translate-y-1 overflow-hidden' : 'max-h-6 opacity-100 translate-y-0'}`}
                aria-hidden={userId && hideGeo ? 'true' : 'false'}
              >
                {loadingLoc ? 'Mendeteksi lokasi...' : alamat}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* WhatsApp */}
              <button
                aria-label="WhatsApp Admin"
                onClick={goWhatsApp}
                className="relative text-green-600 hover:text-green-700 transition"
                title="Chat via WhatsApp"
              >
                <FaWhatsapp size={22} />
              </button>
              {/* Cart */}
              <button
                aria-label="Keranjang"
                onClick={goCart}
                className="relative text-primary hover:text-blueDark transition"
              >
                <FontAwesomeIcon icon={faCartShopping} size="lg" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-[4px] rounded-full bg-primary text-[10px] text-white flex items-center justify-center font-bold">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative mt-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-base rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blueLight bg-white shadow-sm placeholder:text-gray-400 transition"
              placeholder="Cari MCB, kabel, power supply, atau alat listrik…"
              aria-label="Cari produk"
              autoComplete="off"
            />
            <button
              type="submit"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary hover:text-blueDark text-lg"
              aria-label="Cari"
              tabIndex={0}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <FontAwesomeIcon icon={faSearch} />
            </button>
          </form>
        </div>
      </div>

      {/* Spacer sesuai tinggi navbar */}
      <div style={{ height: `${navHeight}px` }} />

      {/* Marquee */}
      <TransactionMarquee className="mt-[-55px] fixed top-0" />
    </div>
  );
};

export default Navbar;
