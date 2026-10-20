import Link from 'next/link';
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

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

  const skeletons = Array.from({ length: 6 });

  const CategoryItem = ({ cat }) => (
    <Link
      href={`/category/${cat.slug}`}
      className="flex flex-col items-center group"
    >
      <div
        className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-xl border border-gray-200 bg-white flex items-center justify-center
                   overflow-hidden relative
                   shadow-[0_3px_6px_rgba(15,23,42,0.12),0_10px_18px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]
                   group-hover:-translate-y-1 group-hover:shadow-[0_6px_10px_rgba(15,23,42,0.14),0_18px_30px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.9)]
                   group-active:translate-y-0 group-active:scale-[0.97]
                   transition-all duration-300"
        style={{ backgroundImage: 'linear-gradient(135deg,#f8fafc 0%,#eef2f6 55%,#f8fafc 100%)' }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/60 via-white/10 to-transparent mix-blend-overlay" />
        <Image
          src={cat.img || placeholderImg}
          alt={cat.name}
          width={88}
          height={88}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { e.currentTarget.src = placeholderImg; }}
          loading="lazy"
        />
        <div className="absolute inset-0 rounded-xl ring-0 ring-orange-400/0 group-hover:ring-2 group-hover:ring-orange-300/50 transition" />
      </div>
      <p className="mt-1.5 text-[11px] sm:text-[12px] font-medium text-gray-700 text-center line-clamp-2 leading-tight max-w-[110px]">
        {cat.name}
      </p>
    </Link>
  );

  return (
    <div>
      <div className="bg-white p-4 rounded-xl shadow-md mb-4">
        <h3 className="text-lg font-semibold mb-3 text-gray-800"> Brand</h3>

        {/* Responsive grid keeps every category visible without horizontal swiping. */}
        <div>
          {loading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
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

            {!loading && categories.length > 0 && (
              <div className="max-h-[280px] sm:max-h-[300px] lg:max-h-[360px] overflow-y-auto overscroll-contain pr-1">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
                {categories.map(cat => (
                  <div key={cat.id} className="flex justify-center">
                    <CategoryItem cat={cat} />
                  </div>
                ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CategorySection;