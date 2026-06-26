import { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '@/utils/firebase';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useDiscounts } from '@/context/DiscountContext';
import { addGuestItem } from '@/utils/guestCart';

const PopupBuyNow = ({ show, onClose, product, userId, buyerName }) => {
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
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
  const hasVariants = Array.isArray(product.sizeVariants) && product.sizeVariants.length > 0;
  const variant = hasVariants ? (product.sizeVariants[selectedVariantIdx] || {}) : {};
  const retailPrice = hasVariants 
    ? (Number(variant.priceRetail) || 0) 
    : (Number(product.priceRetail) || Number(product.price) || 0);
  const wholesalePrice = hasVariants 
    ? (Number(variant.priceWholesale) || 0) 
    : (Number(product.priceWholesale) || Number(product.price) || 0);
  const retailAfterDisc = discount > 0 ? Math.round(retailPrice * (1 - discount / 100)) : retailPrice;
  const wholesaleAfterDisc = discount > 0 ? Math.round(wholesalePrice * (1 - discount / 100)) : wholesalePrice;
  const minWholesale = Number(product.minWholesale) || 1;

  // Harga yang dipakai sesuai qty
  const isWholesaleQty = quantity >= minWholesale;
  const activePrice = isWholesaleQty ? wholesaleAfterDisc : retailAfterDisc;
  const activeLabel = isWholesaleQty ? 'Grosir' : 'Ecer';

  // Buy Now handler
  const handleBuyNow = async () => {
    if (!userId) {
      const isWholesaleQty = quantity >= minWholesale;
      const priceMode = isWholesaleQty ? 'wholesale' : 'retail';
      const retailAfterDisc = discount > 0 ? Math.round(retailPrice * (1 - discount / 100)) : retailPrice;
      const wholesaleAfterDisc = discount > 0 ? Math.round(wholesalePrice * (1 - discount / 100)) : wholesalePrice;
      const activePrice = priceMode === 'wholesale' ? wholesaleAfterDisc : retailAfterDisc;
      const variantLabel = hasVariants && variant.size ? `${variant.size}cm` : '';
      addGuestItem({
        productId: product.id,
        name: product.name,
        price: activePrice,
        priceMode,
        retailPrice: retailAfterDisc,
        wholesalePrice: wholesaleAfterDisc,
        wholesaleMinQty: minWholesale,
        wholesaleMinApplied: isWholesaleQty ? minWholesale : null,
        wholesaleLocked: isWholesaleQty,
        quantity,
        image: mainImage || '',
        weight: hasVariants ? (Number(variant.weight) || Number(product.weight) || 0) : (Number(product.weight) || 0),
        variantLabel,
        discountPercent: discount,
        variantSize: hasVariants ? variant.size : null,
        addedAt: Date.now()
      });
      setIsProcessing(false);
      onClose();
      router.push('/cart/guest');
      return;
    }
    setIsProcessing(true);
    const userCartRef = doc(firestore, 'carts', userId);
    let cartItems = [];
    try {
      const cartSnap = await getDoc(userCartRef);
      if (cartSnap.exists()) {
        cartItems = cartSnap.data()?.items || [];
      }

      const variantLabel = hasVariants && variant.size ? `${variant.size}cm` : '';
      const priceMode = isWholesaleQty ? 'wholesale' : 'retail';

      const retailAfterDisc = discount > 0 ? Math.round(retailPrice * (1 - discount / 100)) : retailPrice;
      const wholesaleAfterDisc = discount > 0 ? Math.round(wholesalePrice * (1 - discount / 100)) : wholesalePrice;
      const activePrice = priceMode === 'wholesale' ? wholesaleAfterDisc : retailAfterDisc;

      // Cari item existing (berdasarkan product + variant size saja agar mode bisa berubah dinamis)
      const existingIndex = cartItems.findIndex(
        item => item.productId === product.id && (item.variantLabel || '') === variantLabel
      );

      if (existingIndex >= 0) {
        // Gabung kuantitas lalu tentukan ulang priceMode bila sudah mencapai wholesale
        const existing = cartItems[existingIndex];
        let newQty = existing.quantity + quantity;

        const wholesaleApplies = existing.wholesaleLocked
          || newQty >= (Number(existing.wholesaleMinQty) || minWholesale);

        let finalPriceMode = wholesaleApplies ? 'wholesale' : 'retail';
        let finalUnitPrice = finalPriceMode === 'wholesale' ? wholesaleAfterDisc : retailAfterDisc;

        cartItems[existingIndex] = {
          ...existing,
          quantity: newQty,
          price: finalUnitPrice,
          priceMode: finalPriceMode,
          retailPrice: retailAfterDisc,
          wholesalePrice: wholesaleAfterDisc,
          wholesaleMinQty: minWholesale,
          wholesaleMinApplied: wholesaleApplies ? (existing.wholesaleMinApplied || minWholesale) : null,
          wholesaleLocked: wholesaleApplies ? true : existing.wholesaleLocked,
          // update weight info to remain consistent with selected variant
          weight: hasVariants ? (Number(variant.weight) || Number(product.weight) || 0) : (Number(product.weight) || 0),
          variantWeight: hasVariants && variant.weight != null ? Number(variant.weight) : (product.weight ? Number(product.weight) : null),
          variantSize: hasVariants ? variant.size : null,
        };
      } else {
        cartItems.push({
          productId: product.id,
          name: product.name,
          price: activePrice,
          priceMode,
          retailPrice: retailAfterDisc,
          wholesalePrice: wholesaleAfterDisc,
          wholesaleMinQty: minWholesale,
          wholesaleMinApplied: isWholesaleQty ? minWholesale : null,
          wholesaleLocked: isWholesaleQty,
          quantity,
          image: mainImage || '',
          // prefer variant weight when present
          weight: hasVariants ? (Number(variant.weight) || Number(product.weight) || 0) : (Number(product.weight) || 0),
          variantWeight: hasVariants && variant.weight != null ? Number(variant.weight) : (product.weight ? Number(product.weight) : null),
          buyerName,
          buyerId: userId,
          variantLabel,
          discountPercent: discount,
          variantSize: hasVariants ? variant.size : null,
          addedAt: Date.now()
        });
      }

      await setDoc(userCartRef, { items: cartItems }, { merge: true });
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
        router.push(`/cart/${userId}`); // langsung ke halaman pembayaran/cart
      }, 800);
    } catch (error) {
      setIsProcessing(false);
      console.error('Error processing buy now:', error);
    }
  };

  const popupContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black bg-opacity-50 flex justify-center items-end"
      style={{ animation: show ? 'popupCartSlideUp 0.4s' : 'none' }}
    >
      <style>
        {`
        @keyframes popupCartSlideUp {
          from { transform: translateY(100%);}
          to { transform: translateY(0);}
        }
        `}
      </style>
      <div className="bg-white w-full max-w-md rounded-t-xl shadow-lg p-6 relative animate-popupCartSlideUp">
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
            width={112}
            height={112}
            className="w-28 h-28 object-cover rounded mb-2"
            priority
          />
          <h3 className="text-base font-semibold text-red-700 mb-1 text-center">{product.name}</h3>
          {/* Pilihan size */}
          {hasVariants && (
            <div className="mb-3 w-full">
              <label className="block text-sm mb-1 font-medium">Ukuran (cm)</label>
              <select
                className="w-full px-2 py-1 border rounded"
                value={selectedVariantIdx}
                onChange={e => {
                  setSelectedVariantIdx(Number(e.target.value));
                  setQuantity(1);
                }}
              >
                {product.sizeVariants.map((v, idx) => (
                  <option key={idx} value={idx}>
                    {v.size} cm
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* Tampilan harga */}
          <div className="mb-4 w-full">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
              {discount > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-400 line-through decoration-gray-400/70">
                      Rp {formatIDR(isWholesaleQty ? wholesalePrice : retailPrice)}
                    </span>
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm tracking-wide">
                      -{discount}%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-red-600 tracking-tight">
                    Rp {formatIDR(activePrice)}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-black text-red-600 tracking-tight">
                  Rp {formatIDR(activePrice)}
                </div>
              )}
            </div>
          </div>
          {/* Qty input */}
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
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-800 transition"
            onClick={handleBuyNow}
            disabled={isProcessing}
          >
            {isProcessing ? "Memproses..." : "Beli Sekarang"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(popupContent, document.body);
};

export default PopupBuyNow;