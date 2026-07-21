import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { auth, firestore } from '@/utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import PopupCart from '@/components/PopupCart';
import { FaShoppingCart } from 'react-icons/fa';

// A compact product preview card for chat embeds
// Props:
// - product: { id, name, image?, images? }
// - onBuyNow: () => void  (called when user taps the card action)
// - canDelete: boolean     (if true, shows delete action)
// - onDelete: () => void   (called when delete is clicked)
export default function SimpleProductCard({ product = {}, onBuyNow /* canDelete, onDelete intentionally ignored */ }) {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [buyerName, setBuyerName] = useState('');
  const [showCartPopup, setShowCartPopup] = useState(false);
  const [fullProduct, setFullProduct] = useState(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        setUserId(u.uid);
        setBuyerName(u.displayName || 'Pembeli');
      } else {
        setUserId(null);
        setBuyerName('');
      }
    });
    return () => unsub();
  }, []);

  const getImage = (p) => {
    if (!p) return '/placeholder.png';
    if (typeof p.image === 'string' && p.image.trim()) return p.image;
    const imgs = p.images;
    if (Array.isArray(imgs)) {
      // find the first non-empty string anywhere in the array (even at indices 4,5,6,...)
      const found = imgs.find((s) => typeof s === 'string' && s.trim());
      if (found) return found;
    } else if (imgs && typeof imgs === 'object') {
      // support object-like images map
      for (const v of Object.values(imgs)) {
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
    return '/placeholder.png';
  };

  const [resolvedImage, setResolvedImage] = useState(getImage(product));

  useEffect(() => {
    let mounted = true;
    const current = getImage(product);
    setResolvedImage(current);
    const needsFetch = (!current || current === '/placeholder.png') && product?.id;
    if (!needsFetch) return () => { mounted = false; };
    (async () => {
      try {
        const pref = doc(firestore, 'products', String(product.id));
        const snap = await getDoc(pref);
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data();
          const better = getImage({ image: data.image, images: data.images });
          if (better && better !== '/placeholder.png') setResolvedImage(better);
          setFullProduct({ id: snap.id, ...data });
        }
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [product?.id]);
  const getDisplayedName = () => {
    let dispName = product?.name || 'Produk';
    const catName = (product?.category || '').toString().trim();
    if (catName && dispName.toLowerCase().includes(catName.toLowerCase())) {
      const regex = new RegExp(catName, 'i');
      dispName = dispName.replace(regex, '').trim();
    }
    return dispName || (product?.name || 'Produk');
  };
  const name = getDisplayedName();
  const id = product?.id || '';

  const handleCartClick = async () => {
    try {
      // Guest-friendly: do not require login. Try to fetch full product for accurate price; fallback to prop.
      if (product?.id) {
        const pref = doc(firestore, 'products', String(product.id));
        const snap = await getDoc(pref);
        if (snap.exists()) {
          setFullProduct({ id: snap.id, ...snap.data() });
          setShowCartPopup(true);
          return;
        }
      }
      // If fetch fails, still open with whatever data we have
      setFullProduct(prev => prev || product);
      setShowCartPopup(true);
    } catch (_) {
      setFullProduct(prev => prev || product);
      setShowCartPopup(true);
    }
  };

  return (
    <div className="w-full flex items-center gap-3 p-2 rounded-lg border bg-white">
      <div className="relative w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100">
        <Image src={resolvedImage} alt={name} fill className="object-cover" sizes="56px" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-gray-800 truncate">{name}</div>
        <div className="text-[13px] text-red-600 font-semibold mt-1">
          {(() => {
            const src = fullProduct || product || {};
            // determine minimal price from sizeVariants or price fields
            const computeMin = (p) => {
              if (!p) return null;
              if (Array.isArray(p.sizeVariants) && p.sizeVariants.length) {
                const prices = p.sizeVariants
                  .map(v => [Number(v.priceRetail) || 0, Number(v.priceWholesale) || 0])
                  .flat()
                  .filter(n => n > 0);
                if (prices.length === 0) return null;
                return Math.min(...prices);
              }
              const retail = Number(p.priceRetail || p.price || 0) || 0;
              const wholesale = Number(p.priceWholesale || p.price || 0) || 0;
              const arr = [retail, wholesale].filter(n => n > 0);
              if (arr.length === 0) return null;
              return Math.min(...arr);
            };
            const min = computeMin(src);
            const formatIDR = (v) => (typeof v === 'number' ? v.toLocaleString('id-ID') : (typeof v === 'string' && !isNaN(Number(v)) ? Number(v).toLocaleString('id-ID') : null));
            if (min) return `Rp ${formatIDR(min)}`;
            return '';
          })()}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {typeof onBuyNow === 'function' && (
            <button
              type="button"
              onClick={onBuyNow}
              className="px-3 py-1 rounded-md text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600"
            >
              Lihat
            </button>
          )}
          <button
            type="button"
            onClick={handleCartClick}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 text-white"
            title="Tambah ke keranjang"
            aria-label="Tambah ke keranjang"
          >
            <FaShoppingCart size={14} />
          </button>
        </div>
      </div>
      {showCartPopup && fullProduct && (
        <PopupCart
          show={showCartPopup}
          onClose={() => setShowCartPopup(false)}
          product={fullProduct}
          userId={userId}
          buyerName={buyerName}
        />
      )}
    </div>
  );
}
