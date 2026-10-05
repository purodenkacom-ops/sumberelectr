import { supabaseAdmin } from '@/utils/supabaseAdmin';
import reviewsData from '@/utils/reviews.json';

function maskName(name) {
  if (!name) return '';
  const clean = String(name).trim();
  if (clean.length <= 2) return clean[0] + '*';
  if (clean.length <= 5) {
    return `${clean[0]}***${clean[clean.length - 1]}`;
  }
  return `${clean.slice(0, 3)}***${clean.slice(-2)}`;
}

function todayKeyTZ() {
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value || '0000';
  const m = parts.find(p => p.type === 'month')?.value || '00';
  const d = parts.find(p => p.type === 'day')?.value || '00';
  return `${y}${m}${d}`;
}

function yesterdayDateStrTZ() {
  const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=3600');
  try {
    const names = Array.isArray(reviewsData?.names) ? reviewsData.names : [];
    if (!names.length) return res.status(200).json({ dateKey: null, items: [] });

    const dateKey = todayKeyTZ();

    // Check cache
    const { data: existing } = await supabaseAdmin
      .from('marquee_transactions')
      .select('*')
      .eq('date_key', dateKey)
      .single();
    if (existing) {
      return res.status(200).json({ dateKey, items: existing.items || [] });
    }

    // Build deterministically
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
      const h = 8 + Math.floor(rng() * 15);
      const m = Math.floor(rng() * 60);
      items.push({
        id: i + 1,
        nameMasked: maskName(name),
        amount,
        date: dateStr,
        time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} WIB`
      });
    }

    await supabaseAdmin.from('marquee_transactions').insert({
      date_key: dateKey,
      items,
      created_at: new Date().toISOString()
    });

    // Cleanup old rows (best-effort)
    try {
      const { data: old } = await supabaseAdmin
        .from('marquee_transactions')
        .select('id')
        .neq('date_key', dateKey)
        .limit(3);
      if (old?.length) {
        await supabaseAdmin
          .from('marquee_transactions')
          .delete()
          .in('id', old.map(r => r.id));
      }
    } catch {}

    return res.status(200).json({ dateKey, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
