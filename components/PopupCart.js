import { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/utils/firebase';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useDiscounts } from '@/context/DiscountContext';
import { addGuestItem } from '@/utils/guestCart';

const PopupCart = ({ show, onClose, product, userId, buyerName }) => {
  const [quantity, setQuantity] = useState(1);
  const [isAddedToCart, setIsAddedToCart] = useState(false);
  const router = useRouter();
  // Hooks must be called unconditionally at the top level
  const { getFor } = useDiscounts();

  if (!show) return null;

  // Ambil gambar utama: cari entry pertama yang non-empty di product.images
  const getFirstImage = (imgs) => {
    if (Array.isArray(imgs) && imgs.length > 0) {
      for (const img of imgs) {
        if (typeof img === 'string' && img.trim().length > 0) return img;
      }
    }
    if (product.image && typeof product.image === 'string' && product.image.trim().length > 0) return product.image;
    return '';
  };

  const mainImage = getFirstImage(product.images);

  // Format harga
  const formatIDR = val =>
    typeof val === 'number'
      ? val.toLocaleString('id-ID')
      : typeof val === 'string' && !isNaN(Number(val))
      ? Number(val).toLocaleString('id-ID')
      : '0';

  const subCatKey = (product.subCategorySlug || product.subCategory || '').toString();
  const catKey = (product.categorySlug || product.category || '').toString();
  const categoryDiscount = getFor(subCatKey) || getFor(catKey);
  const discount = Number(product.discount) || Number(categoryDiscount) || 0;
  // Fallback for legacy products that still have sizeVariants but no base price
  const variants = Array.isArray(product.sizeVariants) ? product.sizeVariants : [];
  let variantMinPrice = null;
  let variantMinWeight = null;
  if (variants.length) {
    let best = null;
    for (const v of variants) {
      const r = Number(v.priceRetail) || 0;
      const w = Number(v.priceWholesale) || 0;
      const candidate = r > 0 ? r : (w > 0 ? w : null);
      if (candidate && (best === null || candidate < best.price)) {
        best = { price: candidate, weight: Number(v.weight) || null };
      }
    }
    if (best) {
      variantMinPrice = best.price;
      variantMinWeight = best.weight;
    }
  }
  const basePriceRaw = (product.price ?? product.priceRetail ?? variantMinPrice ?? 0);
  const basePrice = Number(basePriceRaw) || 0;
  const effectivePrice = discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
  const effectiveWeight = Number(product.weight ?? variantMinWeight ?? 0) || 0;

  // Cart handler (single price, no variants, no wholesale)
  const addToCart = async () => {
    if (!userId) {
      // Guest cart: simpan ke localStorage dan buka cart guest
      addGuestItem({
        productId: product.id,
        name: product.name,
        price: effectivePrice,
        retailPrice: effectivePrice,
        quantity,
        image: mainImage || '',
        weight: effectiveWeight,
        discountPercent: discount,
        addedAt: Date.now()
      });
      setIsAddedToCart(true);
      setTimeout(() => {
        setIsAddedToCart(false);
        onClose();
        router.push('/cart/guest');
      }, 700);
      return;
    }
    const userCartRef = doc(firestore, 'carts', userId);
    let cartItems = [];
    try {
      const cartSnap = await getDoc(userCartRef);
      if (cartSnap.exists()) {
        cartItems = cartSnap.data()?.items || [];
      }
      // Cari item existing hanya berdasarkan productId (karena tidak ada varian)
      const existingIndex = cartItems.findIndex(item => item.productId === product.id);

      if (existingIndex >= 0) {
        const existing = cartItems[existingIndex];
        const newQty = Number(existing.quantity || 0) + Number(quantity || 1);
        cartItems[existingIndex] = {
          ...existing,
          quantity: newQty,
          price: effectivePrice,
          retailPrice: effectivePrice,
          weight: effectiveWeight || existing.weight || 0,
          image: mainImage || existing.image || '',
          discountPercent: discount,
          updatedAt: Date.now()
        };
      } else {
        cartItems.push({
          productId: product.id,
          name: product.name,
          price: effectivePrice,
          retailPrice: effectivePrice,
          quantity,
          image: mainImage || '',
          weight: effectiveWeight,
          buyerName,
          buyerId: userId,
          discountPercent: discount,
          addedAt: Date.now()
        });
      }

      await setDoc(userCartRef, { items: cartItems }, { merge: true });
      setIsAddedToCart(true);
      setTimeout(() => {
        setIsAddedToCart(false);
        onClose();
      }, 1200);
    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  const popupContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black bg-opacity-50 flex justify-center items-end"
      style={{ animation: show ? 'popupCartSlideUp 0.4s' : 'none' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>
        {`
        @keyframes popupCartSlideUp {
          from { transform: translateY(100%);}
          to { transform: translateY(0);}
        }
        `}
      </style>
      <div
        className="bg-white w-full max-w-md rounded-t-xl shadow-lg p-6 relative animate-popupCartSlideUp"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className="flex flex-col items-center">
          <Image
            src={mainImage || '/placeholder.png'}
            alt={product.name}
            width={300}
            height={200}
            className="w-full h-40 object-cover rounded-t"
            priority={true}
          />
          <h3 className="text-base font-semibold text-red-700 mb-2 text-center">{product.name}</h3>
          {/* Tampilan harga */}
          <div className="mb-4 w-full">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
              {discount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-400 line-through decoration-gray-400/70">
                      Rp {formatIDR(basePrice)}
                    </span>
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm tracking-wide">
                      -{discount}%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-red-600 tracking-tight">
                    Rp {formatIDR(effectivePrice)}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-black text-red-600 tracking-tight">
                  Rp {formatIDR(effectivePrice)}
                </div>
              )}
            </div>
          </div>
          {/* Qty input selalu bisa diubah */}
          <div className="flex items-center mb-3 w-full">
            <label className="block text-sm mr-2 font-medium">Qty</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-16 px-2 py-1 border rounded"
            />
          </div>
          <button
            className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-800 transition"
            onClick={addToCart}
            disabled={isAddedToCart}
          >
            {isAddedToCart ? "Ditambahkan!" : "Tambah ke Keranjang"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(popupContent, document.body);
};

export default PopupCart;
