import React, { useEffect, useMemo, useState } from 'react';
import reviewsData from '@/utils/reviews.json';
const NAME_POOL = Array.isArray(reviewsData?.names) ? reviewsData.names : [];

function maskName(name) {
  if (!name) return '';
  const clean = String(name).trim();
  if (clean.length <= 2) return clean[0] + '*';
  if (clean.length <= 5) {
    const first = clean[0];
    const last = clean[clean.length - 1];
    return `${first}***${last}`;
  }
  const head = clean.slice(0, 3);
  const tail = clean.slice(-2);
  return `${head}***${tail}`;
}

function formatIDR(n) {
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
  }
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setSeconds(0, 0);
  return d;
}

export default function TransactionMarquee({ className = '' }) {
  const [items, setItems] = useState([]);
  const yesterdayBase = useMemo(() => getYesterdayDate(), []);

  const todayKey = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}${m}${d}`; // YYYYMMDD
  }, []);

  // Simple seeded RNG (Mulberry32-like)
  const makeRng = (seedStr) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let state = h >>> 0;
    return function next() {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const STORAGE_PREFIX = 'txMarquee:v1:';
    const KEY = STORAGE_PREFIX + todayKey;

    try {
      // Cleanup old cache
      Object.keys(window.localStorage || {}).forEach((k) => {
        if (k.startsWith(STORAGE_PREFIX) && k !== KEY) {
          try { localStorage.removeItem(k); } catch {}
        }
      });

      // Use cache if available
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setItems(parsed);
          return;
        }
      }
    } catch {}

    // Generate deterministically on the client using seeded RNG (no API call needed)
    const rng = makeRng(todayKey);
    const count = 14;
    if (!NAME_POOL.length) { setItems([]); return; }
    const pool = [...NAME_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const take = Math.min(count, pool.length);
    const out = [];
    for (let i = 0; i < take; i++) {
      const name = pool[i];
      const amount = Math.floor(50000 + rng() * (500000 - 50000));
      const h = 8 + Math.floor(rng() * 15);
      const m = Math.floor(rng() * 60);
      const d = new Date(yesterdayBase);
      d.setHours(h, m, 0, 0);
      const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
      out.push({ id: i + 1, nameMasked: maskName(name), amount, date: dateStr, time: `${timeStr} WIB` });
    }
    setItems(out);
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
  }, [yesterdayBase, todayKey]);

  if (!items.length) return null;

  const Line = () => (
    <div className="flex items-center gap-6 whitespace-nowrap leading-tight">
      {items.map((it) => (
        <div
          key={it.id + '-a'}
          className="text-[13px] md:text-sm text-blueDark/90 leading-tight"
        >
          <span className="mr-1">Teknisi</span>
          <span className="font-semibold text-primary">{it.nameMasked}</span>
          <span className="mx-1">Check Out Seharga</span>
          <span className="font-semibold text-primary">{formatIDR(it.amount)}</span>
          <span className="mx-1">pada</span>
          <span className="text-blueDark/70">{it.date}</span>
          <span className="mx-1">pukul</span>
          <span className="text-blueDark/70">{it.time}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div
  className={`sticky relative z-40 w-full overflow-hidden my-0 border-y border-red-100 bg-gradient-to-r from-blueLight/5 via-white to-blueLight/5 shadow-sm ${className}`}
      style={{ top: 'var(--navbar-h, 96px)' }}
    >
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      <div className="inline-flex py-1 md:py-1.5 animate-marquee will-change-transform" aria-label="Transaksi terbaru (dummy)">
        <Line />
        {/* duplicate for seamless loop */}
        <Line />
      </div>
      <style jsx>{`
        @keyframes marqueeTx {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-flex;
          white-space: nowrap;
          animation: marqueeTx 80s linear infinite;
        }
      `}</style>
    </div>
  );
}
