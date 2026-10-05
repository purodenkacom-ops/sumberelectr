import Link from 'next/link';
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';

import { supabase } from '@/utils/supabase';

const placeholderImg = '/logo.png';

const CategorySection = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const shuffledRef = useRef(false);
  const orderRef = useRef([]);

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const list = (data || []).map(d => {
          const name = d.name || 'Kategori';
          const slug = d.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          return {
            id: d.id,
            name,
            slug,
            parentId: d.parent_id || null,
            img: d.icon || d.image || d.img || ''
          };
        });
        let mainCats = list.filter(c => !c.parentId);
        if (!mounted) return;
        if (!shuffledRef.current) {
          shuffle(mainCats);
          orderRef.current = mainCats.map(c => c.id);
          shuffledRef.current = true;
          setCategories(mainCats);
        } else {
          const oldOrder = orderRef.current;
          const existing = oldOrder.map(id => mainCats.find(c => c.id === id)).filter(Boolean);
          const newOnes = mainCats.filter(c => !oldOrder.includes(c.id));
          const merged = [...existing, ...newOnes];
          orderRef.current = merged.map(c => c.id);
          setCategories(merged);
        }
        setLoading(false);
      } catch {
        if (mounted) { setCategories([]); setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // MOBILE (<= lg) logic: tetap 6 per halaman (2 baris x 3) seperti sebelumnya
  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  const pages = chunk(categories, 6);
  const mobileUseSlider = categories.length > 6;
  const skeletons = Array.from({ length: 6 });

  const MobileGridPage = ({ items }) => (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map(cat => (
        <Link
          key={cat.id}
          href={`/category/${cat.slug}`}
          className="flex flex-col items-center group"
        >
          <div
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl border border-gray-200 bg-white flex items-center justify-center
                       overflow-hidden relative
                       shadow-[0_2px_4px_rgba(0,0,0,0.08),0_6px_14px_rgba(0,0,0,0.06)]
                       group-hover:shadow-[0_4px_10px_rgba(0,0,0,0.15),0_12px_28px_rgba(0,0,0,0.12)]
                       group-active:scale-[0.97]
                       transition-all duration-300"
            style={{ backgroundImage: 'linear-gradient(135deg,#f8fafc 0%,#eef2f6 55%,#f8fafc 100%)' }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/60 via-white/10 to-transparent mix-blend-overlay" />
            <Image
              src={cat.img || placeholderImg}
              alt={cat.name}
              width={88}
              height={88}
              className="max-w-[88%] max-h-[88%] object-contain drop-shadow-sm"
              onError={(e) => { e.currentTarget.src = placeholderImg; }}
              loading="lazy"
            />
            <div className="absolute inset-0 rounded-xl ring-0 ring-orange-400/0 group-hover:ring-2 group-hover:ring-orange-300/50 transition" />
          </div>
          <p className="mt-1.5 text-[11px] sm:text-[12px] font-medium text-gray-700 text-center line-clamp-2 leading-tight max-w-[95px]">
            {cat.name}
          </p>
        </Link>
      ))}
    </div>
  );

  // DESKTOP (lg+) : SELALU 1 baris. Tampilkan max 6; jika lebih => horizontal swipe (slidesPerView=6)
  const DesktopItem = ({ cat }) => (
    <Link
      href={`/category/${cat.slug}`}
      className="flex flex-col items-center group"
    >
      <div
        className="w-32 h-32 rounded-xl border border-gray-200 bg-white flex items-center justify-center
                   overflow-hidden relative
                   shadow-[0_2px_4px_rgba(0,0,0,0.08),0_6px_14px_rgba(0,0,0,0.06)]
                   group-hover:shadow-[0_4px_10px_rgba(0,0,0,0.15),0_12px_28px_rgba(0,0,0,0.12)]
                   group-active:scale-[0.97]
                   transition-all duration-300"
        style={{ backgroundImage: 'linear-gradient(135deg,#f8fafc 0%,#eef2f6 55%,#f8fafc 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/60 via-white/10 to-transparent mix-blend-overlay" />
        <Image
          src={cat.img || placeholderImg}
          alt={cat.name}
          width={110}
          height={110}
          className="max-w-[88%] max-h-[88%] object-contain drop-shadow-sm"
          onError={(e) => { e.currentTarget.src = placeholderImg; }}
          loading="lazy"
        />
        <div className="absolute inset-0 rounded-xl ring-0 ring-orange-400/0 group-hover:ring-2 group-hover:ring-orange-300/50 transition" />
      </div>
      <p className="mt-1.5 text-[12px] font-medium text-gray-700 text-center line-clamp-2 leading-tight max-w-[110px]">
        {cat.name}
      </p>
    </Link>
  );

  return (
    <div>
      <div className="bg-white p-4 rounded-xl shadow-md mb-4">
        <h3 className="text-lg font-semibold mb-3 text-gray-800"> Brand</h3>

        {/* MOBILE / TABLET (grid / paged) */}
        <div className="lg:hidden">
          {loading && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {skeletons.map((_, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-gray-100 border border-gray-200 animate-pulse
                                  shadow-[0_2px_4px_rgba(0,0,0,0.08),0_6px_14px_rgba(0,0,0,0.06)]" />
                  <div className="w-20 h-3 mt-2 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          )}

            {!loading && categories.length === 0 && (
              <div className="text-xs text-gray-500">Belum ada kategori.</div>
            )}

            {!loading && categories.length > 0 && !mobileUseSlider && (
              <MobileGridPage items={pages[0]} />
            )}

            {!loading && mobileUseSlider && (
              <Swiper
                spaceBetween={12}
                slidesPerView={1}
                pagination={{ clickable: true }}
                modules={[Pagination]}
                className="pb-6"
              >
                {pages.map((pg, idx) => (
                  <SwiperSlide key={idx}>
                    <MobileGridPage items={pg} />
                  </SwiperSlide>
                ))}
              </Swiper>
            )}
        </div>

        {/* DESKTOP: 1 baris (6 kolom); jika >6 gunakan swiper horizontal */}
        <div className="hidden lg:block">
          {loading && (
            <div className="flex gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-32">
                  <div className="w-32 h-32 rounded-xl bg-gray-100 border border-gray-200 animate-pulse shadow-[0_2px_4px_rgba(0,0,0,0.08),0_6px_14px_rgba(0,0,0,0.06)]" />
                  <div className="w-24 h-3 mt-2 rounded bg-gray-100 animate-pulse mx-auto" />
                </div>
              ))}
            </div>
          )}

          {!loading && categories.length === 0 && (
            <div className="text-xs text-gray-500">Belum ada kategori.</div>
          )}

          {!loading && categories.length > 0 && categories.length <= 6 && (
            <div className="flex gap-4">
              {categories.map(cat => (
                <DesktopItem key={cat.id} cat={cat} />
              ))}
            </div>
          )}

          {!loading && categories.length > 6 && (
            <Swiper
              spaceBetween={16}
              slidesPerView={6}
              pagination={{ clickable: true }}
              modules={[Pagination]}
              className="pb-6"
            >
              {categories.map(cat => (
                <SwiperSlide key={cat.id} className="!w-auto flex justify-center">
                  <DesktopItem cat={cat} />
                </SwiperSlide>
              ))}
            </Swiper>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategorySection;