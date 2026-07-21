import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useDiscounts } from '@/context/DiscountContext';
import { getEffectiveProductSlug } from '@/utils/productSlug';
import { firestore, auth } from '@/utils/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

const formatIDR = (val) => {
  return typeof val === 'number'
    ? val.toLocaleString('id-ID')
    : typeof val === 'string' && !isNaN(Number(val))
    ? Number(val).toLocaleString('id-ID')
    : '0';
};

function useProductPrice(product) {
  const { getFor } = useDiscounts();
  const subCatKey = (product.subCategorySlug || product.subCategory || '').toString();
  const catKey = (product.categorySlug || product.category || '').toString();
  const categoryDiscount = getFor(subCatKey) || getFor(catKey);
  const discount = Number(product.discount) || Number(categoryDiscount) || 0;

  let baseMinPrice = 0;
  if (Array.isArray(product.sizeVariants) && product.sizeVariants.length) {
    const prices = product.sizeVariants
      .map(v => [Number(v.priceRetail) || 0, Number(v.priceWholesale) || 0])
      .flat()
      .filter(n => n > 0);
    baseMinPrice = prices.length ? Math.min(...prices) : 0;
  } else {
    const retail = Number(product.priceRetail || product.price || 0);
    const wholesale = Number(product.priceWholesale || product.price || 0);
    const prices = [retail, wholesale].filter(n => n > 0);
    baseMinPrice = prices.length ? Math.min(...prices) : 0;
  }
  const finalMin = discount > 0 ? Math.round(baseMinPrice * (1 - discount / 100)) : baseMinPrice;
  return { discount, baseMinPrice, finalMin };
}

function getFirstImage(product) {
  if (typeof product.image === 'string' && product.image.trim()) return product.image;
  if (Array.isArray(product.images)) {
    const found = product.images.find(img => typeof img === 'string' && img.trim());
    if (found) return found;
  }
  return '/placeholder.png';
}

// ─── MOBILE CARD ────────────────────────────────────────────────────────────────
const MobileCard = ({ product, currentProductId, cartItems }) => {
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { discount, baseMinPrice, finalMin } = useProductPrice(product);
  const isCurrent = product.id === currentProductId;
  const imageSrc = getFirstImage(product);
  const slug = getEffectiveProductSlug(product, product.id);

  const handleBuy = async () => {
    const user = auth.currentUser;
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
        price: finalMin,
        quantity: qty,
        image: imageSrc !== '/placeholder.png' ? imageSrc : '',
        weight: Number(product.weight) || 0,
        buyerName: user.displayName || 'Pembeli',
        sellerName: 'Purodenka',
        sellerLogo: '/logo.png',
        buyerId: user.uid
      };
      if (idx >= 0) items[idx].quantity += qty; else items.push(newItem);
      await setDoc(cartRef, { items });
      setTimeout(() => setAdding(false), 1000);
    } catch (error) {
      console.error(error);
      setAdding(false);
    }
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${isCurrent ? 'border-red-400 bg-red-50 shadow-sm' : 'border-gray-200 bg-white'}`}>
      <div className="flex gap-3">
        {/* Gambar */}
        <Link href={`/product/${slug}`} className="flex-shrink-0">
          <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border">
            <Image src={imageSrc} alt={product.name} fill className="object-cover" sizes="80px" />
          </div>
        </Link>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <Link href={`/product/${slug}`}>
              <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{product.name}</p>
            </Link>
            {isCurrent && (
              <span className="flex-shrink-0 px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full uppercase tracking-wide">
                Dipilih
              </span>
            )}
            {cartItems?.some(i => i.productId === product.id) && (
              <span className="flex-shrink-0 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-bold rounded-full uppercase tracking-wide border border-orange-200">
                Di Keranjang
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mb-1">SKU: <span className="font-medium text-blue-600">{product.sku || product.id}</span></p>
          <div>
            {discount > 0 && (
              <span className="text-xs line-through text-gray-400 mr-1">Rp {formatIDR(baseMinPrice)}</span>
            )}
            <span className="text-base font-bold text-red-600">Rp {formatIDR(finalMin)}</span>
          </div>
        </div>
      </div>

      {/* Bottom row: qty + beli */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center border rounded-lg overflow-hidden bg-white flex-shrink-0">
          <button
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="w-9 h-9 flex items-center justify-center text-gray-600 font-bold text-lg hover:bg-gray-100 active:bg-gray-200"
          >−</button>
          <span className="w-10 text-center text-sm font-semibold select-none">{qty}</span>
          <button
            onClick={() => setQty(qty + 1)}
            className="w-9 h-9 flex items-center justify-center text-gray-600 font-bold text-lg hover:bg-gray-100 active:bg-gray-200"
          >+</button>
        </div>
        <button
          onClick={handleBuy}
          disabled={adding}
          className="flex-1 h-9 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
        >
          {adding ? '✓ Ditambahkan' : '+ Keranjang'}
        </button>
      </div>
    </div>
  );
};

// ─── DESKTOP TABLE ROW ──────────────────────────────────────────────────────────
const TableRow = ({ product, currentProductId, cartItems }) => {
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const { discount, baseMinPrice, finalMin } = useProductPrice(product);
  const isCurrent = product.id === currentProductId;
  const imageSrc = getFirstImage(product);
  const slug = getEffectiveProductSlug(product, product.id);

  const handleBuy = async () => {
    const user = auth.currentUser;
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
        price: finalMin,
        quantity: qty,
        image: imageSrc !== '/placeholder.png' ? imageSrc : '',
        weight: Number(product.weight) || 0,
        buyerName: user.displayName || 'Pembeli',
        sellerName: 'Purodenka',
        sellerLogo: '/logo.png',
        buyerId: user.uid
      };
      if (idx >= 0) items[idx].quantity += qty; else items.push(newItem);
      await setDoc(cartRef, { items });
      setTimeout(() => setAdding(false), 1000);
    } catch (error) {
      console.error(error);
      setAdding(false);
    }
  };

  return (
    <tr className={`border-b transition-colors ${isCurrent ? 'bg-red-50 hover:bg-red-50' : 'hover:bg-gray-50'}`}>
      <td className="p-3 text-center align-middle">
        <Link href={`/product/${slug}`} className="block relative w-12 h-12 mx-auto bg-gray-100 rounded border">
          <Image src={imageSrc} alt={product.name} fill className="object-cover rounded" sizes="48px" />
        </Link>
      </td>
      <td className="p-3 align-middle text-sm font-medium text-blue-600 hover:underline">
        <Link href={`/product/${slug}`}>{product.sku || product.id}</Link>
      </td>
      <td className="p-3 align-middle text-sm text-gray-800">
        <Link href={`/product/${slug}`}>{product.name}</Link>
        {isCurrent && (
          <span className="ml-2 inline-block px-2 py-0.5 bg-red-600 text-white text-[10px] rounded-full uppercase tracking-wide">
            Dipilih
          </span>
        )}
        {cartItems?.some(i => i.productId === product.id) && (
          <span className="ml-2 inline-block px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded-full uppercase tracking-wide border border-orange-200">
            Di Keranjang
          </span>
        )}
      </td>
      <td className="p-3 align-middle text-sm text-gray-600 text-center">1pc</td>
      <td className="p-3 align-middle text-right whitespace-nowrap">
        {discount > 0 && (
          <div className="text-xs line-through text-gray-400">Rp {formatIDR(baseMinPrice)}</div>
        )}
        <div className="text-sm font-bold text-red-600">Rp {formatIDR(finalMin)}</div>
      </td>
      <td className="p-3 align-middle text-center">
        <div className="flex items-center justify-center border rounded w-24 mx-auto bg-white">
          <button
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="w-7 h-8 flex items-center justify-center text-gray-500 font-bold hover:bg-gray-100"
          >−</button>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-10 h-8 text-center text-sm border-x outline-none p-0 m-0 bg-white hide-spin-button"
          />
          <button
            onClick={() => setQty(qty + 1)}
            className="w-7 h-8 flex items-center justify-center text-gray-500 font-bold hover:bg-gray-100"
          >+</button>
        </div>
      </td>
      <td className="p-3 align-middle text-center">
        <button
          onClick={handleBuy}
          disabled={adding}
          className="bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm px-5 py-1.5 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {adding ? '✓ Ditambahkan' : '+ Keranjang'}
        </button>
      </td>
    </tr>
  );
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────────
export default function SubcategoryProductTable({ products, currentProductId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cartItems, setCartItems] = useState([]);
  
  useEffect(() => {
    let unsubscribeCart = () => {};
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const cartRef = doc(firestore, 'carts', user.uid);
        unsubscribeCart = onSnapshot(cartRef, (snap) => {
          if (snap.exists()) setCartItems(snap.data().items || []);
          else setCartItems([]);
        });
      } else {
        setCartItems([]);
      }
    });
    return () => {
      unsubscribeAuth();
      unsubscribeCart();
    };
  }, []);
  
  if (!products || products.length === 0) return null;

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.sku || p.id)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div className="mt-12 bg-white p-4 lg:p-6 rounded-xl border shadow-sm mb-4">
      <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4">
        Pilih jenis produk yang diinginkan
      </h2>

      {/* Header: info + search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <p className="text-sm text-gray-500">
          Menampilkan <span className="font-semibold text-gray-700">{filtered.length}</span> produk
          {searchTerm && <span className="ml-1 text-gray-400">(dari {products.length} total)</span>}
        </p>
        <input
          type="text"
          placeholder="Cari produk..."
          value={searchTerm}
          onChange={handleSearch}
          className="w-full sm:w-56 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
        />
      </div>

      {/* ── MOBILE: Card list (< md) ── */}
      <div className="flex flex-col gap-3 md:hidden max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
        {filtered.length > 0 ? (
          filtered.map(p => (
            <MobileCard key={p.id} product={p} currentProductId={currentProductId} cartItems={cartItems} />
          ))
        ) : (
          <p className="py-8 text-center text-gray-500 text-sm">
            Tidak ada produk yang cocok dengan pencarian Anda.
          </p>
        )}
      </div>

      {/* ── DESKTOP: Table (≥ md) ── */}
      <div className="hidden md:block rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[580px] overflow-y-auto custom-scrollbar relative">
            <table className="w-full min-w-[700px] text-left border-collapse relative">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 text-gray-700 text-xs font-bold border-b shadow-sm">
                  <th className="p-3 text-center w-16">Gambar</th>
                  <th className="p-3 w-28">Nomor SKU</th>
                  <th className="p-3">Model Number / Nama</th>
                  <th className="p-3 text-center w-16">Unit</th>
                  <th className="p-3 text-right w-36">Harga</th>
                  <th className="p-3 text-center w-28">Jumlah</th>
                  <th className="p-3 text-center w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map(p => (
                    <TableRow key={p.id} product={p} currentProductId={currentProductId} cartItems={cartItems} />
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-gray-500 text-sm bg-white">
                      Tidak ada produk yang cocok dengan pencarian Anda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .hide-spin-button::-webkit-inner-spin-button,
        .hide-spin-button::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .hide-spin-button {
          -moz-appearance: textfield;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #aaa;
        }
      `}</style>
    </div>
  );
}
