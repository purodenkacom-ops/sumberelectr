import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { firestore } from '@/utils/firebase';
import ProductCard from '@/components/ProductCard';

// Recomend: shows products with the lowest sales, randomly picked.
// - Mobile: up to 6
// - Desktop (>=1024px): up to 10
export default function Recomend({ items: initialItems = [] }) {
  const [items, setItems] = useState(initialItems);
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(true);

  // Exclude aquarium/fish categories and keywords
  const excludeKeywords = [
    'akuarium','aquarium','aquascape','ikan','fish','koi','guppy','cupang','manfish','cichlid','platy','udang','shrimp','pakan','tank','substrat','aerator','filter kolam','heater aquarium','filter aquarium','pompa udara','hias air'
  ];
  const isExcluded = (p) => {
    const blob = [p?.category, p?.categorySlug, p?.name, p?.productSlug]
      .filter(Boolean)
      .join(' ')?.toLowerCase() || '';
    return excludeKeywords.some(k => blob.includes(k));
  };

  // Watch viewport for desktop breakpoint
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

  useEffect(() => {
    if (initialItems.length) {
      setItems(initialItems.filter(p => !isExcluded(p)));
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const q = query(collection(firestore, 'products'), orderBy('sold', 'asc'), limit(100));
        const snap = await getDocs(q);
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pool = arr
          .filter(p => !isExcluded(p))
          .map(p => ({ ...p, sold: Number(p.sold) || 0 }));
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        if (mounted) {
          setItems(pool);
          setLoading(false);
        }
      } catch (e) {
        console.error('[Recomend] Failed to load products', e);
        if (mounted) {
          setItems([]);
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [initialItems]);

  const count = isDesktop ? 10 : 6;
  const list = items.slice(0, count);

  // handleClick dihapus, navigasi pakai <Link>

  return (
    <section className="mb-16">
  <div className="bg-white rounded-xl shadow-md p-4 lg:p-6 border border-red-100">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-8 h-8 bg-gradient-to-br from-blueLight to-primary rounded-full flex items-center justify-center text-white shadow-inner">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="w-3.5 h-3.5" />
          </span>
          <h3 className="text-lg md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blueLight to-blueMedium bg-clip-text text-transparent">
            Rekomendasi Peralatan Listrik Pilihan
          </h3>
        </div>
        {loading ? (
          <p className="text-gray-400">Memuat produk...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {list.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
