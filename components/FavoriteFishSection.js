import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';

import ProductCard from './ProductCard'; // Pastikan path sesuai


const FavoriteFishSection = ({ products = [] }) => {
  const [isDesktop, setIsDesktop] = useState(false);

  // Detect desktop (Tailwind lg breakpoint: 1024px)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener('change', update) : mq.addListener(update);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', update) : mq.removeListener(update);
    };
  }, []);

  return (
  <div className="bg-white rounded-xl shadow-md p-4 border border-red-100 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shadow-md bg-gradient-to-br from-blueLight to-primary">
            <FontAwesomeIcon icon={faBolt} className="w-4 h-4" />
          </span>
          <h3 className="text-lg md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blueLight to-blueMedium bg-clip-text text-transparent">
            Produk Terlaris
          </h3>
        </div>
        <Link
          href="/all-product"
          className="text-sm text-primary font-medium hover:underline"
        >
          Lihat Semua Produk
        </Link>
      </div>
      {products.length === 0 && (
        <p className="text-gray-400">Tidak ada produk ditemukan.</p>
      )}
      {products.length > 0 && (
        isDesktop ? (
          <div className="my-2">
            <div className="grid grid-cols-4 gap-3">
              {products.slice(0, 8).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        ) : (
          <div className="my-2">
            <div className="grid grid-cols-2 gap-3">
              {products.slice(0, 4).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default FavoriteFishSection;