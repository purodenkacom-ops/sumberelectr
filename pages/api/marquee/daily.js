import { adminDb } from '@/utils/firebaseAdmin';
import reviewsData from '@/utils/reviews.json';

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

function todayKeyTZ() {
  // Use Asia/Jakarta calendar parts to get YYYYMMDD in WIB
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value || '0000';
  const m = parts.find(p => p.type === 'month')?.value || '00';
  const d = parts.find(p => p.type === 'day')?.value || '00';
  return `${y}${m}${d}`;
}

function yesterdayDateStrTZ() {
  // Get yesterday in Asia/Jakarta as a localized date string
  const now = new Date();
  // Subtract 24h; sufficient for date label purposes with TZ formatting
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric'
  }).format(y);
}

function makeRng(seedStr) {
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
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
  try {
    const names = Array.isArray(reviewsData?.names) ? reviewsData.names : [];
    if (!names.length) return res.status(200).json({ dateKey: null, items: [] });

    const dateKey = todayKeyTZ();
    const col = adminDb.collection('marquee_transactions');
    const docRef = col.doc(dateKey);
    const snap = await docRef.get();
    if (snap.exists) {
      return res.status(200).json({ dateKey, items: snap.data().items || [] });
    }

    // Build deterministically with seed = dateKey
    const rng = makeRng(dateKey);
    const pool = [...names];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const count = Math.min(14, pool.length);
    const dateStr = yesterdayDateStrTZ();
    const items = [];
    for (let i = 0; i < count; i++) {
      const name = pool[i];
      const amount = Math.floor(50000 + rng() * (500000 - 50000));
      const h = 8 + Math.floor(rng() * 15); // 8..22
      const m = Math.floor(rng() * 60);
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      items.push({ id: i + 1, nameMasked: maskName(name), amount, date: dateStr, time: `${hh}:${mm} WIB` });
    }

    await docRef.set({ dateKey, items, createdAt: new Date() });

    // Best-effort cleanup: delete other docs in background (up to 3)
    try {
      const others = await col.where('dateKey', '!=', dateKey).limit(3).get();
      const batch = adminDb.batch();
      others.docs.forEach(d => batch.delete(d.ref));
      if (!others.empty) await batch.commit();
    } catch {}

    return res.status(200).json({ dateKey, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
