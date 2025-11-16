const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com';

function xmlEscape(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toLastMod(val) {
  try {
    if (!val) return new Date().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val?.toDate === 'function') return val.toDate().toISOString();
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return new Date().toISOString();
}

async function fetchSitemapData(adminDb, baseUrl) {
  const urls = [];

  // Static, public pages
  urls.push({ loc: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 });
  urls.push({ loc: `${baseUrl}/all-product`, changefreq: 'daily', priority: 0.8 });
  urls.push({ loc: `${baseUrl}/search`, changefreq: 'daily', priority: 0.6 });

  // Dynamic products and categories
  try {
    const snap = await adminDb.collection('products').get();
    const categorySet = new Set();

    snap.forEach(doc => {
      const data = doc.data() || {};
      const slug = data.productSlug || data.slug || null;
      const lastmod = toLastMod(data.updatedAt || data.publishedAt || data.createdAt);
      if (slug) {
        urls.push({
          loc: `${baseUrl}/product/${encodeURIComponent(slug)}`,
          changefreq: 'daily',
          priority: 0.7,
          lastmod,
        });
      }
      const cat = data.categorySlug || data.category || null;
      if (cat && typeof cat === 'string') categorySet.add(cat);
    });

    // Derived category pages
    Array.from(categorySet).forEach(catSlug => {
      urls.push({
        loc: `${baseUrl}/category/${encodeURIComponent(catSlug)}`,
        changefreq: 'daily',
        priority: 0.6,
      });
    });

    // === Tambahkan artikel ke sitemap ===
    const articleSnap = await adminDb.collection('articles').get();
    articleSnap.forEach(doc => {
      const data = doc.data() || {};
      const slug = data.slug || doc.id;
      const lastmod = toLastMod(data.updatedAt || data.publishedAt || data.createdAt);
      if (slug) {
        urls.push({
          loc: `${baseUrl}/article/${encodeURIComponent(slug)}`,
          changefreq: 'weekly',
          priority: 0.8,
          lastmod,
        });
      }
    });
    // === END artikel ===

  } catch (e) {
    // On error, proceed with static URLs only
    console.warn('[sitemap] Firestore fetch failed:', e?.message || e);
  }

  return urls;
}

function buildXml(urls) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const u of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(u.loc)}</loc>`);
    if (u.lastmod) lines.push(`    <lastmod>${xmlEscape(u.lastmod)}</lastmod>`);
    if (u.changefreq) lines.push(`    <changefreq>${xmlEscape(u.changefreq)}</changefreq>`);
    if (typeof u.priority === 'number') lines.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
}

export default function SiteMapPage() {
  // This page does not render anything on the client.
  return null;
}

export async function getServerSideProps({ req, res }) {
  try {
    const { adminDb } = await import('@/utils/firebaseAdmin');
    const envBase = process.env.NEXT_PUBLIC_SITE_URL;
    const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = (envBase && envBase.trim()) ? envBase.replace(/\/$/, '') : `${proto}://${host}`;
    const urls = await fetchSitemapData(adminDb, baseUrl);
    const xml = buildXml(urls);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    res.write(xml);
    res.end();
  } catch (e) {
    const fallback = buildXml([{ loc: `${DEFAULT_BASE_URL}/`, changefreq: 'daily', priority: 1.0 }]);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.write(fallback);
    res.end();
  }

  return { props: {} };
}
