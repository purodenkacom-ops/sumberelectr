import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { supabase } from '@/utils/supabase';

// AdsImage: 1:1 image carousel showing up to 16 random products (1 image each)
// Props:
// - userId (optional): if provided, re-randomize when it changes (e.g., on login)
// - max (default 16): max products to rotate
// - intervalMs (default 3500): auto-rotate interval
// - className (optional): wrapper class
export default function AdsImage({ userId, max = 16, intervalMs = 3500, transitionMs = 600, className = '' }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(null);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);
  const animTimeoutRef = useRef(null);

  // Helper: get first non-empty image URL
  const firstImage = (imgs = [], fallback = '') => {
    if (Array.isArray(imgs)) {
      for (const u of imgs) {
        if (typeof u === 'string' && u.trim().length > 0) return u;
      }
    }
    if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;
    return '';
  };

  // Fisher-Yates shuffle
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .limit(100);
        if (error) throw error;
        const products = (data || []);
        const shuffled = shuffle(products);

        const picks = [];
        for (const p of shuffled) {
          if (p && (p.productSlug || p.slug || p.id)) {
            const img = firstImage(p.images, p.image);
            const video = typeof p.video === 'string' && p.video.trim().length ? p.video.trim() : null;
            if (video || img) {
              picks.push({
                id: p.id,
                slug: p.productSlug || p.slug || p.id,
                src: img || '',
                video,
                alt: p.name || 'Product',
              });
            }
          }
          if (picks.length >= max) break;
        }
        if (mounted) {
          setItems(picks);
          setIndex(0);
        }
      } catch (err) {
        console.error('[AdsImage] Failed to load products', err);
        if (mounted) {
          setItems([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  // re-run on login or refresh (mount). userId change will re-randomize
  }, [userId, max]);

  // Auto-rotate
  useEffect(() => {
    if (!items || items.length <= 1) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % items.length;
        setPrevIndex(prev);
        setAnimating(true);
        clearTimeout(animTimeoutRef.current);
        animTimeoutRef.current = setTimeout(() => {
          setAnimating(false);
          setPrevIndex(null);
        }, Math.max(200, transitionMs));
        return next;
      });
    }, Math.max(1200, intervalMs));
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(animTimeoutRef.current);
    };
  }, [items, intervalMs, transitionMs]);

  const current = items[index] || null;
  const previous = prevIndex != null ? items[prevIndex] : null;

  const handleClick = () => {
    if (!current) return;
    router.push(`/product/${current.slug}`);
  };

  // 1:1 box using padding-bottom trick to avoid relying on aspect-ratio plugin
  return (
    <div className={`w-full ${className}`}>
      <div className="relative w-full pb-[100%] overflow-hidden rounded-md">
        {/* Previous (exiting) image */}
        {previous && animating && (
          <div className="absolute inset-0 pointer-events-none adsimage-out">
            <Image
              src={previous.src}
              alt={previous.alt}
              fill
              sizes="(max-width: 768px) 100vw, 300px"
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Current (entering/visible) image */}
        {current ? (
          <button
            type="button"
            onClick={handleClick}
            className={`absolute inset-0 cursor-pointer ${animating ? 'adsimage-in' : 'adsimage-show'}`}
            aria-label={current.alt}
          >
            {current.video ? (
              <video
                src={current.video}
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                playsInline
                loop
                muted
                preload="metadata"
              />
            ) : (
              <Image
                src={current.src}
                alt={current.alt}
                fill
                sizes="(max-width: 768px) 100vw, 300px"
                className="object-cover"
                priority
              />
            )}
          </button>
        ) : (
          <div className="absolute inset-0 bg-gray-100" />
        )}
      </div>
      <style>{`
        @keyframes adsimageFadeIn {
          0% { opacity: 0; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes adsimageFadeOut {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        .adsimage-in { animation: adsimageFadeIn ${transitionMs}ms ease forwards; }
        .adsimage-out { animation: adsimageFadeOut ${transitionMs}ms ease forwards; }
        .adsimage-show { opacity: 1; transform: scale(1); }
      `}</style>
    </div>
  );
}


