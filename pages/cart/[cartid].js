import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore } from '@/utils/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { generateInvoiceId } from '@/utils/invoice';
import { FaArrowLeft, FaShoppingCart, FaPlus } from 'react-icons/fa';
import ProductCard from '@/components/ProductCard';
import BannerCarousel from '@/components/BannerCarousel';
import Link from 'next/link';
import Image from 'next/image';

// Helper untuk generate shipping address dari struktur user register baru
const getShippingAddress = (userData) => {
  // Gabungkan street + area jadi address
  const street = userData.street || '';
  const area = userData.area || {};
  const addressParts = [
    street,
    area.name,
    area.city_name,
    userData.district || area.district,
    area.province,
    area.postal_code
  ].filter(Boolean);
  const address = addressParts.join(', ');

  // Gunakan area_id dari userData.area jika ada, jika tidak fallback ke userData.area_id
  const areaId = area.area_id || userData.area_id || area.id || '';

  return {
    receiver_name: userData.buyerName || userData.name || '',
    phone: userData.phone || area.phone || '',
    address: address,
    city: area.city_name || userData.city || '',
    province: area.province || userData.province || '',
    district: userData.district || area.district || '',
    postal_code: area.postal_code || userData.postal_code || '',
    area_id: areaId,
    email: userData.email || area.email || '',
    notes: area.notes || null,
  };
};

// ========== Tambah helper pricing (letakkan setelah getShippingAddress / sebelum komponen) ==========
function computeUnitPrice(item, qty) {
  const q = Number(qty) || 0;
  const retail = Number(item.retailPrice ?? item.price ?? 0);
  let unitPrice = retail;
  let mode = 'retail';
  let appliedMinQty = null;

  if (Array.isArray(item.wholesaleTiers) && item.wholesaleTiers.length) {
    const tiers = item.wholesaleTiers
      .map(t => ({ minQty: Number(t.minQty), price: Number(t.price) }))
      .filter(t => t.minQty && t.price)
      .sort((a,b)=> a.minQty - b.minQty);
    let picked = null;
    for (const t of tiers) {
      if (q >= t.minQty) picked = t;
    }
    if (picked) {
      unitPrice = picked.price;
      mode = 'wholesale';
      appliedMinQty = picked.minQty;
    }
  } else {
    const min = Number(item.wholesaleMinQty ?? item.wholesaleMin ?? item.minWholesaleQty);
    const wPrice = Number(item.wholesalePrice ?? item.bulkPrice);
    if (min && wPrice && q >= min) {
      unitPrice = wPrice;
      mode = 'wholesale';
      appliedMinQty = min;
    }
  }
  return { unitPrice, mode, appliedMinQty };
}

function applyPricingToCartItems(items) {
  return items.map(it => {
    const { unitPrice, mode, appliedMinQty } = computeUnitPrice(it, it.quantity);
    return {
      ...it,
      retailPrice: it.retailPrice ?? it.price,
      price: unitPrice,
      priceMode: mode,
      // update wholesaleMinApplied tiap kali agar bisa turun bertahap sampai min tier aktif
      wholesaleMinApplied: appliedMinQty ?? it.wholesaleMinApplied ?? null
    };
  });
}
// ========== END helper pricing ==========

const CartPage = () => {
  const router = useRouter();
  const { cartid } = router.query;

  const [cartItems, setCartItems] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const selectAllRef = useRef(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [voucherList, setVoucherList] = useState([]);
  const [voucherError, setVoucherError] = useState('');
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [recommendProducts, setRecommendProducts] = useState([]);
  const [bannerList, setBannerList] = useState([]);

  useEffect(() => {
    const fetchCart = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push('/login');
        return;
      }
      if (!cartid) return;

      try {
        const cartRef = doc(firestore, 'carts', cartid);
        const cartSnap = await getDoc(cartRef);
        if (!cartSnap.exists()) {
          router.push('/');
          return;
        }
        if (user.uid !== cartid) {
          router.push('/');
          return;
        }
        setUserId(user.uid);

        const cartData = cartSnap.data();
        const items = cartData.items || [];
        setCartItems(applyPricingToCartItems(items));
      } catch (err) {
        console.error('Gagal ambil keranjang:', err);
      }
      setLoading(false);
    };
    fetchCart();
  }, [cartid, router]);

  useEffect(() => {
    const fetchVouchers = async () => {
      try {
        const snap = await getDocs(collection(firestore, 'vouchers'));
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setVoucherList(list);
      } catch (e) {
        console.error('Gagal ambil voucher', e);
      }
    };
    fetchVouchers();
  }, []);

  // Fetch rekomendasi produk (ambil 16 produk random)
  useEffect(() => {
    const fetchRecommend = async () => {
      try {
        const snap = await getDocs(collection(firestore, 'products'));
        let list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        // Shuffle
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        setRecommendProducts(list.slice(0, 16));
      } catch (e) {
        setRecommendProducts([]);
      }
    };
    fetchRecommend();
  }, []);

  // Fetch banners
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const snap = await getDocs(collection(firestore, 'banners'));
        setBannerList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setBannerList([]);
      }
    };
    fetchBanners();
  }, []);

  const getKey = (item, idx) => `${item.productId}-${item.variant || ''}-${idx}`;

  const handleSelectItem = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  // Select all / deselect all handler
  const toggleSelectAll = () => {
    if (cartItems.length === 0) return;
    const allKeys = cartItems.map((it, idx) => getKey(it, idx));
    const allSelected = selectedKeys.length === cartItems.length && cartItems.length > 0;
    setSelectedKeys(allSelected ? [] : allKeys);
  };

  // Manage indeterminate state of select-all checkbox
  useEffect(() => {
    if (!selectAllRef.current) return;
    const total = cartItems.length;
    const selected = selectedKeys.length;
    selectAllRef.current.indeterminate = selected > 0 && selected < total;
  }, [selectedKeys, cartItems]);

  const handleQuantityChange = async (key, newQty) => {
    if (newQty < 1) return;

    const current = cartItems.find((it, idx) => getKey(it, idx) === key);
    if (current) {
      if (current.priceMode === 'wholesale') {
        const minLock = current.wholesaleMinApplied
          || current.wholesaleMinQty
          || current.wholesaleMin
          || current.minWholesaleQty
          || 0;
        // Tidak boleh turun di bawah minimum wholesale aktif
        if (newQty < minLock) {
          console.warn('Qty tidak boleh di bawah minimum grosir:', minLock);
          return;
        }
      }
    }

    // Update state lokal
    setCartItems(prev => prev.map((it, idx) => {
      const k = getKey(it, idx);
      if (k !== key) return it;
      const { unitPrice, mode, appliedMinQty } = computeUnitPrice(it, newQty);
      return {
        ...it,
        quantity: newQty,
        retailPrice: it.retailPrice ?? it.price,
        price: unitPrice,
        priceMode: mode,
        wholesaleMinApplied: appliedMinQty ?? it.wholesaleMinApplied ?? null
      };
    }));

    // Sinkron Firestore
    try {
      const cartRef = doc(firestore, 'carts', cartid);
      const snap = await getDoc(cartRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const items = (data.items || []).map((it, idx) => {
        const k = getKey(it, idx);
        if (k !== key) return it;
        const { unitPrice, mode, appliedMinQty } = computeUnitPrice(it, newQty);
        return {
          ...it,
          quantity: newQty,
          retailPrice: it.retailPrice ?? it.price,
          price: unitPrice,
          priceMode: mode,
          wholesaleMinApplied: appliedMinQty ?? it.wholesaleMinApplied ?? null
        };
      });
      await updateDoc(cartRef, { items });
    } catch (e) {
      console.error('Gagal update qty', e);
    }
  };

  // Ubah handleRemoveItem:
  const handleRemoveItem = async (key) => {
    setCartItems(prev => prev.filter((it, idx) => getKey(it, idx) !== key));

    try {
      const cartRef = doc(firestore, 'carts', cartid);
      const snap = await getDoc(cartRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const itemsBefore = data.items || [];
      const removedItem = itemsBefore.find((it, idx) => getKey(it, idx) === key);
      const itemsAfter = itemsBefore.filter((it, idx) => getKey(it, idx) !== key);
      // Re-apply pricing (kalau qty item lain berubah tidak, tapi konsisten format)
      await updateDoc(cartRef, { items: applyPricingToCartItems(itemsAfter) });
    } catch (e) {
      console.error('Gagal hapus item', e);
    }
  };

  const handleApplyVoucher = () => {
    setVoucherError('');
    setVoucherApplied(false);
    setVoucherDiscount(0);

    const code = voucherCode.trim();
    if (!code) return;

    const v = voucherList.find(x => x.code.toUpperCase() === code.toUpperCase());
    if (!v) {
      setVoucherError('Kode voucher tidak valid.');
      return;
    }
    if (!v.active) {
      setVoucherError('Voucher nonaktif.');
      return;
    }

    const now = new Date();
    const start = v.startDate?.seconds ? new Date(v.startDate.seconds * 1000) : (v.startDate ? new Date(v.startDate) : null);
    const end = v.endDate?.seconds ? new Date(v.endDate.seconds * 1000) : (v.endDate ? new Date(v.endDate) : null);
    if ((start && now < start) || (end && now > end)) {
      setVoucherError('Voucher di luar periode.');
      return;
    }

    const selectedItems = cartItems.filter((item, idx) => selectedKeys.includes(getKey(item, idx)));
    const subtotal = selectedItems.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);

    let discount = 0;
    if (v.type === 'percentage') {
      discount = Math.floor(subtotal * (Number(v.value) || 0) / 100);
      if (v.maxDiscount && discount > v.maxDiscount) discount = v.maxDiscount;
    } else if (v.type === 'fixed') {
      discount = Number(v.value) || 0;
      if (discount > subtotal) discount = subtotal;
    }

    if (discount <= 0) {
      setVoucherError('Diskon tidak berlaku.');
      return;
    }

    setVoucherDiscount(discount);
    setVoucherApplied(true);
  };

  const handleCheckout = async () => {
    if (selectedKeys.length === 0) {
      alert('Pilih minimal 1 produk.');
      return;
    }

    try {
      const cartRef = doc(firestore, 'carts', cartid);
      const cartSnap = await getDoc(cartRef);
      if (!cartSnap.exists()) {
        alert('Cart tidak ditemukan.');
        return;
      }
      const cartDoc = cartSnap.data();

      const buyerId = userId || cartDoc.userId || cartid;

      // Ambil user
      let userData = {};
      if (buyerId) {
        const userRef = doc(firestore, 'users', buyerId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) userData = userSnap.data();
      }

      // Items terpilih
      const selectedItemsFull = cartItems
        .map((item, idx) => ({ key: getKey(item, idx), ...item }))
        .filter(it => selectedKeys.includes(it.key));

      if (!selectedItemsFull.length) {
        alert('Item terpilih kosong.');
        return;
      }

      const selectedItems = selectedItemsFull.map(it => {
        // Derive variant label/size from common fields used across add-to-cart flows
        const variantLabel = it.variantLabel || it.variant || it.variant_size || it.variantSize || null;
        // Try to extract numeric size (cm) from label if possible (e.g., "4 cm" or "4cm")
        let variantSize = null;
        if (it.variantSize && typeof it.variantSize === 'number') variantSize = it.variantSize;
        else if (it.variant_size && typeof it.variant_size === 'number') variantSize = it.variant_size;
        else if (variantLabel) {
          const m = String(variantLabel).match(/(\d+(?:\.\d+)?)/);
          if (m) variantSize = Number(m[1]);
        }

        return {
          productId: it.productId,
          name: it.name,
          variant: variantLabel,
          variantLabel: variantLabel,
          variantSize: variantSize,
          price: Number(it.price) || 0,
          retailPrice: Number(it.retailPrice || it.price || 0) || 0,
          priceMode: it.priceMode || (it.wholesaleLocked ? 'wholesale' : 'retail') || 'retail',
          quantity: Number(it.quantity) || 1,
          weight: Number(it.weight) || 0,
          subtotal: (Number(it.price) || 0) * (Number(it.quantity) || 1),
        };
      });

      const subtotal = selectedItems.reduce((s, i) => s + i.subtotal, 0);
      const totalWeight = selectedItems.reduce((s, i) => s + (i.weight * i.quantity), 0);

      let voucherObj = null;
      if (voucherApplied && voucherDiscount > 0) {
        const matched = voucherList.find(v => v.code.toUpperCase() === voucherCode.trim().toUpperCase());
        if (matched) {
          voucherObj = {
            code: matched.code,
            type: matched.type,
            value: matched.value,
            maxDiscount: matched.maxDiscount ?? null,
            discountApplied: voucherDiscount,
          };
        } else {
          voucherObj = {
            code: voucherCode.trim(),
            type: 'custom',
            value: 0,
            discountApplied: voucherDiscount,
          };
        }
      }

      const shippingAddress = getShippingAddress(userData);
      if (!shippingAddress.area_id) {
        alert('Alamat (area) belum lengkap di profil. Lengkapi alamat utama terlebih dahulu.');
        return;
      }

      const invoiceId = generateInvoiceId();

      const invoiceData = {
        invoiceId,
        cartId: cartid,
        buyerId,
        buyerName: userData.buyerName || userData.name || '',
        buyerEmail: userData.email || '',
        buyerPhone: userData.phone || '',
        shippingAddress,
        destinationAreaId: shippingAddress.area_id,
        items: selectedItems,
        subtotal,
        totalWeight,
        totalQuantity: selectedItems.reduce((s, i) => s + i.quantity, 0),
        voucher: voucherObj,
        voucherDiscount: voucherObj ? voucherObj.discountApplied : 0,
        shippingCost: 0,
        grandTotal: subtotal - (voucherObj ? voucherObj.discountApplied : 0),
        status: 'draft',
        payment: {
          gateway: 'xendit',
          status: 'not_initiated',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'invoices', invoiceId), invoiceData);

      // Hapus item terpilih dari cart
      const selectedKeySet = new Set(selectedKeys);
      const remaining = cartItems.filter((it, idx) => !selectedKeySet.has(getKey(it, idx)));

      if (remaining.length > 0) {
        await updateDoc(cartRef, { items: applyPricingToCartItems(remaining) });
        setCartItems(remaining);
      } else {
        // Cart kosong: hapus dokumen
        await deleteDoc(cartRef);
        setCartItems([]);
      }

      router.push(`/product/payment/${invoiceId}`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat invoice.');
    }
  };

  const totalSelected = cartItems.filter((i, idx) => selectedKeys.includes(getKey(i, idx)));
  const totalPriceRaw = totalSelected.reduce(
    (sum, i) => sum + Number(i.price) * i.quantity,
    0
  );
  const totalWeight = totalSelected.reduce(
    (sum, i) => sum + Number(i.weight || 0) * i.quantity,
    0
  );
  const totalPrice = Math.max(totalPriceRaw - voucherDiscount, 0);

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <>
      {/* Hapus <Navbar /> dan <Footer /> */}
      {/* Header cart */}
      <div className="flex items-center bg-white shadow px-4 py-3 sticky top-0 z-20">
        <button onClick={() => router.push('/')} className="mr-3">
          <FaArrowLeft className="text-xl text-gray-700" />
        </button>
        <h1 className="font-semibold text-lg flex items-center gap-2">
          <FaShoppingCart className="text-red-600" /> Keranjang Saya
        </h1>
      </div>

      <div className="container mx-auto px-3 py-4 pb-28 min-h-screen">
        {cartItems.length === 0 ? (
          <div className="text-center text-gray-500">
            Keranjang kosong. <Link href="/" className="text-red-500 underline">Belanja sekarang!</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {cartItems.length > 1 && (
              <div className="bg-white border rounded-lg shadow-sm p-3 flex items-center gap-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={selectedKeys.length === cartItems.length && cartItems.length > 0}
                  onChange={toggleSelectAll}
                  className="accent-red-600"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium">Pilih semua</div>
                  <div className="text-xs text-gray-500">Centang semua item untuk checkout sekaligus</div>
                </div>
              </div>
            )}
            {cartItems.map((item, idx) => {
              const key = getKey(item, idx);
              return (
                <div key={key} className="bg-white border rounded-xl p-4 flex gap-4 transition hover:shadow-md items-center">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(key)}
                    onChange={() => handleSelectItem(key)}
                    className="w-5 h-5 accent-red-600 cursor-pointer rounded border-gray-300"
                  />
                  <div className="relative w-20 h-20 flex-shrink-0 bg-gray-50 rounded-lg overflow-hidden border">
                    <Image 
                      src={item.image || '/placeholder.png'} 
                      alt={item.name} 
                      fill 
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm md:text-base leading-snug line-clamp-2">
                          {item.name}
                        </p>
                        {item.variant && (
                          <p className="text-xs text-gray-500 mt-1">
                            Varian: <span className="font-medium text-gray-700">{item.variant}</span>
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={() => handleRemoveItem(key)} 
                        className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                        title="Hapus item"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                    
                    <div className="flex justify-between items-end mt-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="text-red-600 font-bold text-sm md:text-base">
                            Rp {Number(item.price).toLocaleString('id-ID')}
                          </p>
                          {item.priceMode === 'wholesale' && (
                            <span className="bg-green-100 text-green-700 font-bold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Grosir
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                        <button
                          onClick={() => handleQuantityChange(key, item.quantity - 1)}
                          disabled={
                            item.priceMode === 'wholesale' &&
                            item.quantity <= (item.wholesaleMinApplied || item.wholesaleMinQty || item.wholesaleMin || item.minWholesaleQty || 0)
                          }
                          className={`w-8 h-8 flex items-center justify-center text-lg font-medium transition-colors ${
                            (item.priceMode === 'wholesale' && item.quantity <= (item.wholesaleMinApplied || item.wholesaleMinQty || item.wholesaleMin || item.minWholesaleQty || 0))
                              ? 'text-gray-300 bg-gray-50 cursor-not-allowed'
                              : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200 cursor-pointer'
                          }`}
                        >−</button>
                        <span className="w-10 text-center text-sm font-semibold text-gray-700 select-none">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(key, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 text-lg font-medium hover:bg-gray-100 active:bg-gray-200 transition-colors"
                        >+</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Button tambah produk lain */}
            <div className="flex justify-center mt-6">
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold shadow transition"
              >
                <FaPlus className="text-lg" />
                <span className="text-sm font-medium">Tambahkan produk lain</span>
              </button>
            </div>
            {/* Checkout */}
            {selectedKeys.length > 0 && (
              <div className="mt-6 bg-white border-t pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 flex flex-col gap-1">
                  <p className="text-sm">
                    Total: <span className="font-semibold text-red-600">Rp {totalPrice.toLocaleString('id-ID')}</span>
                  </p>
                  <p className="text-xs text-gray-500">Berat: {totalWeight} gram</p>
                </div>
                <button
                  onClick={handleCheckout}
                  className="bg-red-600 text-white px-5 py-2 rounded-full font-semibold text-sm shadow transition"
                >
                  Checkout ({selectedKeys.length})
                </button>
              </div>
            )}
            {/* Rekomendasi produk swipe */}
            {recommendProducts.length > 0 && (
              <div className="mt-8">
                <h2
                  className="mb-3 text-base font-semibold text-orange-700 tracking-tight"
                  style={{
                    fontFamily: "'Inter', 'Segoe UI', 'Arial', sans-serif",
                    letterSpacing: '-0.5px'
                  }}
                >
                  🔥 Produk pilihan untuk kamu
                </h2>
                <div className="overflow-x-auto">
                  <div
                    className="
                      flex gap-4
                      pb-2
                      snap-x snap-mandatory
                      "
                    style={{
                      WebkitOverflowScrolling: 'touch',
                      scrollSnapType: 'x mandatory'
                    }}
                  >
                    {recommendProducts.map((p, idx) => (
                      <div
                        key={p.id}
                        className="
                          min-w-[45%] max-w-[48%] sm:min-w-[23%] sm:max-w-[24%] lg:min-w-[12%] lg:max-w-[13%]
                          snap-center
                        "
                        style={{
                          flex: '0 0 auto'
                        }}
                      >
                        <ProductCard product={p} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* Banner carousel di bawah rekomendasi produk */}
            <div className="mt-8">
              <BannerCarousel banners={bannerList} />
            </div>
            
          </div>
        )}
      </div>
    </>
  );
};

export default CartPage;