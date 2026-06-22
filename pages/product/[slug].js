import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { firestore } from '@/utils/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { adminDb } from '@/utils/firebaseAdmin';
import {
  getEffectiveProductSlug,
  findProductBySlug,
  serializeProductDoc,
} from '@/utils/productSlug';
import ProductCard from '@/components/ProductCard';
import Reviews from '@/components/Reviews';
import MiniNavbar from '@/components/MiniNavbar';
import {
  FaShoppingCart,
  FaWhatsapp,
  FaFacebook,
  FaLink
} from 'react-icons/fa';
import PopupCart from '@/components/PopupCart';
import PopupBuyNow from '@/components/PopupBuyNow';
import Image from 'next/image';
import { useDiscounts } from '@/context/DiscountContext';

// pastikan NEXT_PUBLIC_SITE_URL sudah di set di .env
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com';

function formatIDR(n) {
  const v = Number(n || 0);
  return v.toLocaleString('id-ID');
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function useFirebaseAuth() {
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let unsub = null;
    (async () => {
      try {
        const { getAuth } = await import('firebase/auth');
        const a = getAuth();
        setAuth(a);
        setUser(a.currentUser);
        unsub = a.onAuthStateChanged(u => setUser(u));
      } catch (e) {
        // SSR ignore
      }
    })();
    return () => unsub && unsub();
  }, []);

  return { auth, user };
}

const SingleProductPage = ({ product, relatedProducts, crossProducts, reviews: initialReviews = [] }) => {
  const router = useRouter();
  const { auth, user } = useFirebaseAuth();

  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [currentImage, setCurrentImage] = useState(0);
  const [addedToast, setAddedToast] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reviews, setReviews] = useState(initialReviews || []);
  const [cartCount, setCartCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showCartPopup, setShowCartPopup] = useState(false);
  const [showBuyPopup, setShowBuyPopup] = useState(false);
  const [cartMode, setCartMode] = useState('cart');
  const [cartStatus, setCartStatus] = useState('idle');

  // Harga
  const { baseMinPrice, baseMaxPrice } = useMemo(() => {
    if (Array.isArray(product.sizeVariants) && product.sizeVariants.length) {
      const prices = product.sizeVariants
        .map(v => [Number(v.priceRetail) || 0, Number(v.priceWholesale) || 0])
        .flat()
        .filter(n => n > 0);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return { baseMinPrice: min, baseMaxPrice: max };
    }
    const retail = Number(product.priceRetail || product.price || 0);
    const wholesale = Number(product.priceWholesale || product.price || 0);
    const min = Math.min(retail, wholesale);
    const max = Math.max(retail, wholesale);
    return { baseMinPrice: min, baseMaxPrice: max };
  }, [product]);
  const { getFor } = useDiscounts();
  const subCatKey = (product.subCategorySlug || product.subCategory || '').toString();
  const catKey = (product.categorySlug || product.category || '').toString();
  const categoryDiscount = getFor(subCatKey) || getFor(catKey);
  const discount = Number(product.discount) || Number(categoryDiscount) || 0;
  const finalMin = discount > 0 ? Math.round(baseMinPrice * (1 - discount / 100)) : baseMinPrice;
  const finalMax = discount > 0 ? Math.round(baseMaxPrice * (1 - discount / 100)) : baseMaxPrice;

  // user name
  useEffect(() => {
    if (user) setBuyerName(user.displayName || 'Pembeli');
  }, [user]);

  // Cart counter
  useEffect(() => {
    if (!auth || !user?.uid) return;
    const cartRef = doc(firestore, 'carts', user.uid);
    const unsub = onSnapshot(cartRef, snap => {
      if (!snap.exists()) {
        setCartCount(0);
        return;
      }
      const items = Array.isArray(snap.data().items) ? snap.data().items : [];
      const distinct = new Set(
        items
          .filter(it => (it?.quantity || 0) > 0)
          .map(it => it.productId || it.id || it.name || JSON.stringify(it))
      ).size;
      setCartCount(distinct);
    });
    return () => unsub();
  }, [auth, user?.uid]);

  // detect mobile
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 1024);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const changeQty = (type) => {
    setQuantity(q => type === 'inc' ? q + 1 : Math.max(1, q - 1));
  };

  const addToCart = async (gotoCart = false) => {
    if (!user) {
      if (typeof window !== 'undefined') localStorage.setItem('redirectAfterLogin', router.asPath);
      return router.push('/login');
    }
    setAdding(true);
    try {
      const cartRef = doc(firestore, 'carts', user.uid);
      const cartSnap = await getDoc(cartRef);
      let items = cartSnap.exists() ? (cartSnap.data().items || []) : [];
      const idx = items.findIndex(i => i.productId === product.id);
      const newItem = {
        productId: product.id,
        name: product.name,
        priceRetail: Number(product.priceRetail || baseMinPrice),
        priceWholesale: Number(product.priceWholesale || baseMinPrice),
        price: Number(product.priceRetail || baseMinPrice),
        quantity,
        image: product.images?.[0] || '',
        weight: Number(product.weight) || 0,
        buyerName,
        sellerName: 'Purodenka',
        sellerLogo: '/logo.png',
        buyerId: user.uid
      };
      if (idx >= 0) items[idx].quantity += quantity; else items.push(newItem);
      await setDoc(cartRef, { items });
      setAddedToast(true);
      setTimeout(() => setAddedToast(false), 3000);
      if (gotoCart) router.push(`/cart/${user.uid}`);
    } finally {
      setAdding(false);
    }
  };

  const shareUrl = `${SITE_URL}/product/${product.productSlug}`;
  const title = `${product.name} | Harga & Jual ${product.name} Terbaik`;
  const description = product.description?.slice(0, 160) || `Beli ${product.name} harga terbaik & terpercaya.`;

  // Image normalisasi
  let rawImages = [];
  if (Array.isArray(product.images)) rawImages = product.images;
  else if (product.images && typeof product.images === 'object') rawImages = Object.values(product.images);
  else if (product.images) rawImages = [product.images];

  let ordered = [];
  if (rawImages.length) {
    const preferredIdx = [0,1,2,3,4,5];
    const taken = new Set();
    preferredIdx.forEach(i => {
      if (i < rawImages.length) {
        const v = rawImages[i];
        if (typeof v === 'string' && v.trim()) { ordered.push(v); taken.add(i); }
      }
    });
    rawImages.forEach((v,i) => {
      if (!taken.has(i) && typeof v === 'string' && v.trim()) ordered.push(v);
    });
  }
  const validImages = ordered;
  const makeAbsolute = (u) => {
    if (!u) return `${SITE_URL}/logo.png`;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `${SITE_URL}${u}`;
    return `${SITE_URL}/${u}`;
  };
  const absoluteImages = validImages.map(makeAbsolute).filter((v, i, arr) => v && arr.indexOf(v) === i).slice(0, 4);
  if (!absoluteImages.length) absoluteImages.push(`${SITE_URL}/logo.png`);
  const primaryImage = absoluteImages[0];
  const ogImages = absoluteImages;

  // Structured Data Product
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: absoluteImages,
    description,
    sku: product.id,
    brand: { "@type": "Brand", name: "Purodenka" },
    offers: {
      "@type": "AggregateOffer",
      url: shareUrl,
      priceCurrency: "IDR",
      lowPrice: String(finalMin),
      highPrice: String(finalMax),
      offerCount: Array.isArray(product.sizeVariants) ? product.sizeVariants.length : 1,
      availability: "https://schema.org/InStock"
    },
    aggregateRating: (() => {
      const ratingVal = Number(product.rating || 0);
      const reviewCount = Number(product.reviewCount || (Array.isArray(reviews) ? reviews.length : 0));
      if (!ratingVal || ratingVal <= 0 || !reviewCount) return undefined;
      return {
        "@type": "AggregateRating",
        ratingValue: ratingVal.toFixed(1),
        ratingCount: reviewCount,
        bestRating: "5",
        worstRating: "1"
      };
    })()
  };

  // Reset index jika jumlah gambar berkurang / 0
  useEffect(() => {
    if (currentImage > validImages.length - 1) setCurrentImage(0);
  }, [validImages.length, currentImage]);

  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const goCart = () => {
    if (user && user.uid) {
      router.push(`/cart/${user.uid}`);
    } else {
      if (typeof window !== 'undefined') localStorage.setItem('redirectAfterLogin', '/cart/temp');
      router.push('/login');
    }
  };

  // chat admin -> dialihkan ke WhatsApp Admin (tanpa Firestore chat)
  const chatWithAdmin = async () => {
    const productLine = `${product.name} (ID: ${product.id})`;
    const msg = `Halo Admin, saya tertarik dengan ${productLine}.\nLink produk: ${shareUrl}`;
    let number = process.env.NEXT_PUBLIC_ADMIN_WA || '6281234567890';
    try {
      const r = await fetch('/api/whatsapp/next');
      const data = await r.json();
      if (data?.number) number = data.number;
    } catch {}
    const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
    if (typeof window !== 'undefined') {
      const w = window.open(waUrl, '_blank');
      if (!w) window.location.href = waUrl;
    }
  };

  // Handler popup cart
  const handleCartPopup = (mode = 'cart') => {
    if (mode === 'buy') setShowBuyPopup(true);
    else {
      setCartMode(mode);
      setShowCartPopup(true);
      setCartStatus('idle');
    }
  };

  // Handler submit dari PopupCart
  const handleCartSubmit = async (variant, qty) => {
    setCartStatus('adding');
    if (!user) {
      if (typeof window !== 'undefined') localStorage.setItem('redirectAfterLogin', router.asPath);
      return router.push('/login');
    }
    try {
      const cartRef = doc(firestore, 'carts', user.uid);
      const cartSnap = await getDoc(cartRef);
      let items = cartSnap.exists() ? (cartSnap.data().items || []) : [];
      const idx = items.findIndex(i =>
        i.productId === product.id &&
        i.variantLabel === `${variant.size}cm`
      );
      const discount = Number(product.discount) || 0;
      const retailPrice = Number(variant.priceRetail) || 0;
      const wholesalePrice = Number(variant.priceWholesale) || 0;
      const minWholesale = Number(product.minWholesale) || 1;
      const isWholesaleQty = qty >= minWholesale;
      const retailAfterDisc = discount > 0 ? Math.round(retailPrice * (1 - discount / 100)) : retailPrice;
      const wholesaleAfterDisc = discount > 0 ? Math.round(wholesalePrice * (1 - discount / 100)) : wholesalePrice;
      const activePrice = isWholesaleQty ? wholesaleAfterDisc : retailAfterDisc;
      const priceMode = isWholesaleQty ? 'wholesale' : 'retail';
      const variantLabel = `${variant.size}cm`;
      if (idx >= 0) {
        items[idx].quantity += qty;
        items[idx].price = activePrice;
        items[idx].priceMode = priceMode;
      } else {
        items.push({
          productId: product.id,
          name: product.name,
          price: activePrice,
          priceMode,
          retailPrice: retailAfterDisc,
          wholesalePrice: wholesaleAfterDisc,
          wholesaleMinQty: minWholesale,
          quantity: qty,
          image: product.images?.[0] || '',
          weight: Number(product.weight) || 0,
          buyerName,
          buyerId: user.uid,
          variantLabel,
          discountPercent: discount,
          variantSize: variant.size,
          addedAt: Date.now()
        });
      }
      await setDoc(cartRef, { items }, { merge: true });
      setCartStatus('added');
      setTimeout(() => {
        setShowCartPopup(false);
        setCartStatus('idle');
      }, 1200);
    } catch (err) {
      setCartStatus('idle');
    }
  };

  // Handler submit dari PopupBuyNow
  const handleBuyNowSubmit = async (variant, qty) => {
    if (!user) {
      if (typeof window !== 'undefined') localStorage.setItem('redirectAfterLogin', router.asPath);
      return router.push('/login');
    }
    try {
      const cartRef = doc(firestore, 'carts', user.uid);
      const cartSnap = await getDoc(cartRef);
      let items = cartSnap.exists() ? (cartSnap.data().items || []) : [];
      const idx = items.findIndex(i =>
        i.productId === product.id &&
        i.variantLabel === `${variant.size}cm`
      );
      const discount = Number(product.discount) || 0;
      const retailPrice = Number(variant.priceRetail) || 0;
      const wholesalePrice = Number(variant.priceWholesale) || 0;
      const minWholesale = Number(product.minWholesale) || 1;
      const isWholesaleQty = qty >= minWholesale;
      const retailAfterDisc = discount > 0 ? Math.round(retailPrice * (1 - discount / 100)) : retailPrice;
      const wholesaleAfterDisc = discount > 0 ? Math.round(wholesalePrice * (1 - discount / 100)) : wholesalePrice;
      const activePrice = isWholesaleQty ? wholesaleAfterDisc : retailAfterDisc;
      const priceMode = isWholesaleQty ? 'wholesale' : 'retail';
      const variantLabel = `${variant.size}cm`;
      if (idx >= 0) {
        items[idx].quantity += qty;
        items[idx].price = activePrice;
        items[idx].priceMode = priceMode;
      } else {
        items.push({
          productId: product.id,
          name: product.name,
          price: activePrice,
          priceMode,
          retailPrice: retailAfterDisc,
          wholesalePrice: wholesaleAfterDisc,
          wholesaleMinQty: minWholesale,
          quantity: qty,
          image: product.images?.[0] || '',
          weight: Number(product.weight) || 0,
          buyerName,
          buyerId: user.uid,
          variantLabel,
          discountPercent: discount,
          variantSize: variant.size,
          addedAt: Date.now()
        });
      }
      await setDoc(cartRef, { items }, { merge: true });
      setShowBuyPopup(false);
      router.push(`/cart/${user.uid}`);
    } catch (err) {
      setShowBuyPopup(false);
    }
  };

  // --- RENDER ---
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description}/>
        <link rel="canonical" href={shareUrl}/>
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content={title}/>
        <meta name="og:product:id" content={product.id} />
        <meta property="og:description" content={description}/>
          <meta property="og:type" content="product"/>
        <meta property="og:site_name" content="Purodenka"/>
        {ogImages.map((img, i) => (
          <meta key={`ogimg-${i}`} property="og:image" content={img} />
        ))}
        <meta property="og:image:secure_url" content={primaryImage} />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="1200" />
        <meta property="og:image:alt" content={product.name} />
        <meta property="og:url" content={shareUrl}/>
        <meta name="twitter:card" content="summary_large_image"/>
        <meta name="twitter:title" content={title}/>
        <meta name="twitter:description" content={description}/>
        <meta name="twitter:image" content={primaryImage}/>
        <meta name="twitter:image:alt" content={product.name} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}/>
      </Head>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-4 md:px-6 pt-4 pb-28">
        <MiniNavbar />
        <div className="grid lg:grid-cols-2 gap-10">
          {/* LEFT: GALLERY */}
          <div className="relative">
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-100 ring-1 ring-gray-200">
              {discount > 0 && (
                <div className="absolute top-3 left-3 bg-yellow-300 rounded-md px-3 py-1 text-xs font-bold text-gray-800 shadow">
                  Disc. {discount}%
                </div>
              )}
              <Image
                src={validImages[currentImage] || '/placeholder.png'}
                alt={product.name}
                width={600}
                height={600}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            {/* Thumbnail */}
            {validImages.length > 1 && (
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {validImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden ring-2 transition ${
                      i === currentImage ? 'ring-red-500' : 'ring-transparent hover:ring-gray-300'
                    }`}
                    aria-label={`Gambar ${i + 1}`}
                    type="button"
                  >
                    <Image
                      src={img}
                      alt={`Thumbnail ${i + 1}`}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
            {/* Reviews (desktop) */}
            <div className="hidden lg:block mt-6">
              <Reviews productId={product.id} />
            </div>
          </div>
          {/* RIGHT: INFO */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl lg:text-3xl font-semibold text-gray-800 leading-tight">{product.name}</h1>
              <div className="ml-4 hidden lg:flex items-center gap-2 text-sm text-gray-600">
                <div className="font-semibold text-yellow-500">
                  {(product.rating || (reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length) : 0)).toFixed(1)} ★
                </div>
                <div className="text-xs text-gray-500">{formatNumber(product.sold ?? product.salesCount ?? 0)} terjual</div>
              </div>
            </div>
            <div className="mt-3">
              {discount > 0 ? (
                <div className="flex flex-col">
                  <span className="text-[11px] sm:text-xs font-medium line-through text-gray-400 tracking-tight">
                    Rp {formatIDR(baseMinPrice)}
                    {baseMaxPrice !== baseMinPrice && ` - Rp ${formatIDR(baseMaxPrice)}`}
                  </span>
                  <div className="text-2xl sm:text-[26px] font-bold text-red-600 leading-tight tracking-tight">
                    Rp {formatIDR(finalMin)}
                    {finalMax !== finalMin && ` - Rp ${formatIDR(finalMax)}`}
                  </div>
                </div>
              ) : (
                <div className="text-2xl sm:text-[26px] font-bold text-red-600 leading-tight tracking-tight">
                  Rp {formatIDR(finalMin)}
                  {finalMax !== finalMin && ` - Rp ${formatIDR(finalMax)}`}
                </div>
              )}
            </div>
            {/* Mobile: show rating and sold below price */}
            <div className="mt-2 lg:hidden flex items-center gap-3">
              <div className="font-semibold text-yellow-500">
                {(product.rating || (reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length) : 0)).toFixed(1)} ★
              </div>
              <div className="text-xs text-gray-500">{formatNumber(product.sold ?? product.salesCount ?? 0)} terjual</div>
            </div>
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
              <span>Berat: {product.weight || 0} gr</span>
              {product.category && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">{product.category}</span>}
            </div>
            {product.description && (
              <div className="mt-5">
                <p
                  className="text-sm leading-relaxed text-gray-700 whitespace-pre-line"
                  style={
                    isMobile && !showFullDesc
                      ? { display: '-webkit-box', WebkitLineClamp: 12, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                      : {}
                  }
                >
                  {product.description}
                </p>
                {isMobile && (
                  <div className="mt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setShowFullDesc(s => !s)}
                      className="text-sm text-primary font-medium underline"
                    >
                      {showFullDesc ? 'Tampilkan Sedikit' : 'Tampilkan Semua'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Reviews (mobile) */}
            <div className="block lg:hidden mt-6">
              <Reviews productId={product.id} />
            </div>
            {/* SHARE */}
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bagikan</p>
              <div className="flex gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${product.name} - ${shareUrl}`)}`}
                  target="_blank" rel="noopener"
                  className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600"
                  aria-label="Bagikan WhatsApp"
                ><FaWhatsapp /></a>
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank" rel="noopener"
                  className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700"
                  aria-label="Bagikan Facebook"
                ><FaFacebook /></a>
                <button
                  onClick={() => { navigator.clipboard.writeText(shareUrl); }}
                  className="w-9 h-9 rounded-full bg-gray-600 text-white flex items-center justify-center hover:bg-gray-700"
                  aria-label="Salin Link"
                ><FaLink /></button>
                <button
                  onClick={chatWithAdmin}
                  className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600"
                  aria-label="Chat WhatsApp Admin"
                >
                  <FaWhatsapp />
                </button>
              </div>
            </div>
            {/* DESKTOP floating chat button (bottom-right) */}
            <button
              onClick={chatWithAdmin}
              aria-label="Chat WhatsApp Admin"
              className="hidden lg:flex items-center justify-center fixed right-8 bottom-8 z-50 w-14 h-14 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600"
            >
              <FaWhatsapp size={22} />
            </button>
            {/* ACTION BUTTONS */}
            <div className="mt-8 hidden sm:flex sm:flex-row gap-3">
              <button
                onClick={() => handleCartPopup('buy')}
                disabled={adding}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 rounded-lg shadow disabled:opacity-60"
              >
                Beli Sekarang
              </button>
              <button
                onClick={() => handleCartPopup('cart')}
                disabled={adding}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg shadow disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <FaShoppingCart /> Keranjang
              </button>
            </div>
          </div>
        </div>
        {/* RELATED */}
        {relatedProducts?.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Produk Terkait</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {relatedProducts.slice(0, 8).map(p => (
                <ProductCard key={p.id} product={p}/>
              ))}
            </div>
          </div>
        )}
        {/* CROSS SELL */}
        {crossProducts?.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Rekomendasi Lain Untukmu
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
              {crossProducts.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
        {/* TOAST */}
        {addedToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm px-4 py-2 rounded-lg shadow z-50">
            Ditambahkan ke keranjang
          </div>
        )}
      </main>
      {/* MOBILE STICKY BAR */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center gap-3 z-40">
        <div className="flex-1">
          <div className="text-xs text-gray-500">{discount > 0 && (
            <span className="line-through mr-1">Rp {formatIDR(baseMinPrice)}</span>
          )}</div>
          <div className="text-sm font-bold text-red-600">
            Rp {formatIDR(finalMin)}{finalMax !== finalMin && ` - ${formatIDR(finalMax)}`}
          </div>
        </div>
        <button
          onClick={() => handleCartPopup('cart')}
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium shadow disabled:opacity-60 flex items-center gap-2"
        >
          <FaShoppingCart size={14}/> Keranjang
        </button>
        <button
          onClick={chatWithAdmin}
          className="px-3 py-2 rounded-lg bg-green-500 text-white text-sm font-medium shadow flex items-center justify-center"
          aria-label="Chat WhatsApp Admin"
        >
          <FaWhatsapp />
        </button>
        <button
          onClick={() => handleCartPopup('buy')}
          disabled={adding}
          className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium shadow disabled:opacity-60"
        >
          Beli
        </button>
      </div>
      {/* POPUP CART */}
      <PopupCart
        show={showCartPopup}
        onClose={() => setShowCartPopup(false)}
        product={product}
        mode={cartMode}
        onSubmit={handleCartSubmit}
        status={cartStatus}
        userId={user?.uid}
        buyerName={buyerName}
      />
      {/* POPUP BUY NOW */}
      <PopupBuyNow
        show={showBuyPopup}
        onClose={() => setShowBuyPopup(false)}
        product={product}
        userId={user?.uid}
        buyerName={buyerName}
        onSubmit={handleBuyNowSubmit}
      />
    </>
  );
};

// SSG — Admin SDK (same as homepage) so Vercel build/ISR can read Firestore reliably
export async function getStaticPaths() {
  try {
    const snap = await adminDb.collection('products').get();
    const seen = new Set();
    const paths = [];
    snap.forEach((doc) => {
      const slug = getEffectiveProductSlug(doc.data(), doc.id);
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      paths.push({ params: { slug } });
    });
    return { paths, fallback: 'blocking' };
  } catch (e) {
    console.error('[getStaticPaths] products:', e);
    return { paths: [], fallback: 'blocking' };
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params;

  let productDoc;
  try {
    productDoc = await findProductBySlug(adminDb, slug);
  } catch (e) {
    console.error('[getStaticProps] findProductBySlug:', e);
    return { notFound: true };
  }
  if (!productDoc) return { notFound: true };

  const product = serializeProductDoc(productDoc);

  // RELATED (same category)
  let relatedProducts = [];
  if (product.category) {
    const relSnap = await adminDb
      .collection('products')
      .where('category', '==', product.category)
      .limit(12)
      .get();
    relatedProducts = relSnap.docs
      .filter((d) => d.id !== productDoc.id)
      .map(serializeProductDoc);
  }

  // CROSS-SELL
  const needExtra = relatedProducts.length < 4;
  let crossProducts = [];
  if (needExtra) {
    const extraSnap = await adminDb
      .collection('products')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    const pool = extraSnap.docs
      .filter((d) => d.id !== product.id && !relatedProducts.find((r) => r.id === d.id))
      .map(serializeProductDoc);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    crossProducts = pool.slice(0, 10);
  } else {
    const pool = relatedProducts.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    crossProducts = pool.slice(0, 5);
  }

  // Reviews
  let reviews = [];
  try {
    const reviewsSnap = await adminDb
      .collection('reviews')
      .where('productId', '==', String(product.id))
      .limit(50)
      .get();
    reviews = reviewsSnap.docs.map((d) => {
      const rd = d.data() || {};
      return {
        id: d.id,
        name: rd.name || '',
        comment: rd.comment || '',
        rating: rd.rating || 0,
        createdAt: rd.createdAt?.toDate?.()
          ? rd.createdAt.toDate().toISOString()
          : rd.createdAt || null,
      };
    });
  } catch {
    reviews = [];
  }

  return {
    props: { product, relatedProducts, crossProducts, reviews },
    revalidate: 60,
  };
}

export default SingleProductPage;