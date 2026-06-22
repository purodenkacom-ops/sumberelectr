import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FaStar, FaShoppingCart } from 'react-icons/fa';
import { auth } from '@/utils/firebase';
import PopupCart from './PopupCart';
import Image from 'next/image';
import { useDiscounts } from '@/context/DiscountContext';
import { getEffectiveProductSlug } from '@/utils/productSlug';

const ProductCard = ({ product, onAddToCart }) => {
  const [userId, setUserId] = useState(null);
  const [buyerName, setBuyerName] = useState('');
  const [showCartPopup, setShowCartPopup] = useState(false);

  // Auth check
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        setUserId(user.uid);
        setBuyerName(user.displayName || 'Pembeli');
      }
    });
    return () => unsub();
  }, []);

  // Format harga
  const formatIDR = val =>
    typeof val === 'number'
      ? val.toLocaleString('id-ID')
      : typeof val === 'string' && !isNaN(Number(val))
      ? Number(val).toLocaleString('id-ID')
      : '0';

  // Ambil harga minimum dari variant
  let minPrice = null;
  if (Array.isArray(product.sizeVariants) && product.sizeVariants.length > 0) {
    minPrice = product.sizeVariants.reduce(
      (min, v) => {
        const retail = Number(v.priceRetail) || 0;
        const wholesale = Number(v.priceWholesale) || 0;
        const validPrices = [retail, wholesale].filter(p => p > 0);
        const currentMin = validPrices.length > 0 ? Math.min(...validPrices) : 0;
        if (min === null) return currentMin;
        return currentMin > 0 && currentMin < min ? currentMin : min;
      },
      null
    );
  } else {
    const pR = Number(product.priceRetail ?? product.price ?? 0);
    const pW = Number(product.priceWholesale ?? product.price ?? 0);
    const valid = [pR, pW].filter(p => p > 0);
    minPrice = valid.length > 0 ? Math.min(...valid) : 0;
  }

  const { getFor } = useDiscounts();
  const subCatKey = (product.subCategorySlug || product.subCategory || '').toString();
  const catKey = (product.categorySlug || product.category || '').toString();
  const categoryDiscount = getFor(subCatKey) || getFor(catKey);
  const discount = Number(product.discount) || Number(categoryDiscount) || 0;
  const priceAfterDiscount =
    discount > 0 ? Math.round(minPrice * (1 - discount / 100)) : minPrice;

  // Supabase video URL
  const supabaseVideoUrl = product.video || product.supabaseVideo || '';

  // Observer state
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const hideTimerRef = useRef(null);
  const videoRef = useRef(null);

  // Intersection observer untuk cek viewport
  useEffect(() => {
    if (!supabaseVideoUrl || !containerRef.current || typeof IntersectionObserver === 'undefined') return;
    const el = containerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          setInView(entry.isIntersecting);
        });
      },
      {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.15
      }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [supabaseVideoUrl]);

  // Toggle video berdasarkan inView
  useEffect(() => {
    if (!supabaseVideoUrl) return;
    if (inView) {
      setShowVideo(true);
    } else {
      setShowVideo(false);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        } catch {}
      }
    }
  }, [supabaseVideoUrl, inView]);

  // Timer auto-hide 15s
  useEffect(() => {
    if (showVideo) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setShowVideo(false);
      }, 20000);

      if (videoRef.current) {
        const p = videoRef.current.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } else {
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        } catch {}
      }
    }
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [showVideo]);

  // Cart click
  const handleCartClick = e => {
    e.preventDefault();
    e.stopPropagation();
    // Guest-friendly: open cart popup even if not logged in.
    setShowCartPopup(true);
  };

  const effectiveSlug = getEffectiveProductSlug(product, product.id);

  // Ambil gambar utama
  const getFirstImage = () => {
    if (typeof product.image === 'string' && product.image.trim()) return product.image;
    if (Array.isArray(product.images)) {
      const found = product.images.find(img => typeof img === 'string' && img.trim());
      if (found) return found;
    }
    return null;
  };
  const mainImage = getFirstImage();
  const imageSrc = mainImage || '/logo.png';

  return (
    <>
      <Link
        href={`/product/${effectiveSlug}`}
        className="block bg-white rounded-lg shadow-sm overflow-hidden relative transition-transform hover:scale-[1.01] border border-red-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400"
        tabIndex={0}
        ref={containerRef}
      >
        <div className="relative w-full h-40 aspect-square bg-gray-100">
          {showVideo && supabaseVideoUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <video
                ref={videoRef}
                src={supabaseVideoUrl}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                controls={false}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    const p = videoRef.current.play();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                  }
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-black/0 to-transparent" />
            </div>
          ) : (
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="absolute inset-0 w-full h-full object-cover"
              priority={false}
            />
          )}

          {discount > 0 && (
            <div className="absolute top-2 right-2">
              <div
                className="
                  w-12 h-12 rounded-lg border border-yellow-400
                  bg-gradient-to-br from-yellow-300 via-yellow-200 to-yellow-300
                  flex flex-col items-center justify-center
                  shadow-[0_2px_6px_rgba(0,0,0,0.18)]
                  text-gray-900 font-bold leading-tight
                  animate-[fadeIn_.35s_ease]
                "
                aria-label={`Diskon ${discount}%`}
              >
                <span className="text-[10px] uppercase tracking-wide">Disc.</span>
                <span className="text-sm">{discount}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 pb-7 relative">
          <h3 className="text-sm font-semibold line-clamp-1 text-red-700">
            {product.name}
          </h3>
          <p className="text-red-600 font-bold text-sm">
            {discount > 0 ? (
              <>
                <span className="line-through text-gray-500 mr-2">
                  Rp {formatIDR(minPrice)}
                </span>
                <span className="text-red-600 font-bold">
                  Rp {formatIDR(priceAfterDiscount)}
                </span>
              </>
            ) : (
              <>Rp {formatIDR(minPrice)}</>
            )}
          </p>
          <div className="flex items-center text-xs mt-1 text-gray-600">
            <FaStar className="text-yellow-500 mr-1" size={12} />
            <span>{product.rating || '-'}</span>
            <span className="ml-2">({(product.sold ?? product.salesCount ?? 0)} terjual)</span>
          </div>
          <button
            onClick={handleCartClick}
            className="absolute right-2 bottom-2 p-2 rounded-full flex items-center justify-center transition-colors duration-200 bg-red-400 hover:bg-red-500 active:bg-red-600 text-white shadow-lg"
            style={{ zIndex: 10 }}
            aria-label="Tambah ke keranjang"
            tabIndex={0}
          >
            <FaShoppingCart size={18} />
          </button>
        </div>
      </Link>
      <PopupCart
        show={showCartPopup}
        onClose={() => setShowCartPopup(false)}
        product={product}
        userId={userId}
        buyerName={buyerName}
      />
    </>
  );
};

export default ProductCard;
