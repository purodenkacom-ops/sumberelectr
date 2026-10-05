import { supabaseAdmin } from '@/utils/supabaseAdmin';

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
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return new Date().toISOString();
}

async function fetchSitemapData(baseUrl) {
  const urls = [];
  urls.push({ loc: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 });
  urls.push({ loc: `${baseUrl}/all-product`, changefreq: 'daily', priority: 0.8 });

  try {
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('product_slug, category_slug, updated_at');

    const categorySet = new Set();
    for (const p of products || []) {
      const slug = p.product_slug;
      if (slug) {
        urls.push({
          loc: `${baseUrl}/product/${encodeURIComponent(slug)}`,
          changefreq: 'daily',
          priority: 0.7,
          lastmod: toLastMod(p.updated_at),
        });
      }
      if (p.category_slug && typeof p.category_slug === 'string') categorySet.add(p.category_slug);
    }

    Array.from(categorySet).forEach(catSlug => {
      urls.push({
        loc: `${baseUrl}/category/${encodeURIComponent(catSlug)}`,
        changefreq: 'daily',
        priority: 0.6,
      });
    });

    const { data: articles } = await supabaseAdmin
      .from('articles')
      .select('slug, updated_at');

    for (const a of articles || []) {
      const slug = a.slug;
      if (slug) {
        urls.push({
          loc: `${baseUrl}/article/${encodeURIComponent(slug)}`,
          changefreq: 'weekly',
          priority: 0.8,
          lastmod: toLastMod(a.updated_at),
        });
      }
    }
  } catch (e) {
    console.warn('[sitemap] Supabase fetch failed:', e?.message || e);
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
  return null;
}

export async function getServerSideProps({ req, res }) {
  try {
    const envBase = process.env.NEXT_PUBLIC_SITE_URL;
    const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = (envBase && envBase.trim()) ? envBase.replace(/\/$/, '') : `${proto}://${host}`;
    const urls = await fetchSitemapData(baseUrl);
    const xml = buildXml(urls);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=604800');
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
