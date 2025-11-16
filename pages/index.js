import React from 'react';
import Head from 'next/head';
import { NextSeo } from 'next-seo';
import Navbar from '../components/Navbar';
import CategorySection from '../components/CategorySection';
import Footer from '../components/Footer';
import BannerCarousel from '@/components/BannerCarousel';
import FavoriteFishSection from '@/components/FavoriteFishSection';
import PopupCart from '@/components/PopupCart';
import VisitOurFarm from '@/components/VisitOurFarm';
import { adminDb } from '@/utils/firebaseAdmin';
import AdsImage from '@/components/adsimage';
import Recomend from '@/components/Recomend';
import HomeArticles from '@/components/HomeArticles';
// TransactionMarquee import removed (unused currently)

const siteUrlBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com';
const siteUrl = siteUrlBase.endsWith('/') ? siteUrlBase : `${siteUrlBase}/`;

// NEW: reusable SEO strings for electrical store
const SEO_TITLE = "Purodenka | Toko Peralatan Listrik & Elektronik Industri • Harga Kompetitif";
const SEO_DESCRIPTION = "Purodenka adalah toko peralatan listrik dan elektronik industri terpercaya di Indonesia. Tersedia MCB/MCCB, contactor, relay, power supply, rotary switch, sensor, kabel/wiring duct, din rail, saklar, dan aksesori panel listrik. Barang asli bergaransi, siap kirim ke seluruh Indonesia.";
const SEO_KEYWORDS = "toko peralatan listrik, elektronik industri, mcb, mccb, contactor, relay, power supply, smps, kabel duct, wiring duct, rotary switch, buzzer panel, din rail, panel listrik, aksesoris panel, sensor, saklar";


const Homepage = ({ ogImage, ogImages = [], favoriteFish, recommendations = [], bannerMeta = [], farmInfo, favoritesSchema = [], recommendationsSchema = [], articles = [] }) => {
  const [showCartPopup, setShowCartPopup] = React.useState(false);
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const handleAddToCart = (productData) => {
    setSelectedProduct(productData);
    setShowCartPopup(true);
  };

  // Helpers for schema fallbacks
  const absUrl = (u) => {
    if (!u || typeof u !== 'string') return null;
    if (/^https?:\/\//i.test(u)) return u;
    const base = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
    return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`;
  };
  // Normalisasi & prioritas: pastikan ogImage (dari server) diprioritaskan jika valid,
  // lalu tambahkan ogImages lainnya (dedupe), batasi 4 total, fallback ke logo.
  // Build enriched banner list (prefer server-provided bannerMeta with alt/size)
  let enriched = Array.isArray(bannerMeta) && bannerMeta.length
    ? bannerMeta.map(b => ({
    url: absUrl(b.url),
  alt: b.alt && b.alt.trim() ? b.alt.trim() : 'Purodenka - Toko Peralatan Listrik',
        width: Number(b.width) || 1200,
        height: Number(b.height) || 630
      }))
    : [];
  if (!enriched.length) {
    // fallback: derive from ogImage + ogImages
    const gather = [];
    if (typeof ogImage === 'string' && ogImage.trim()) gather.push(ogImage.trim());
    if (Array.isArray(ogImages)) {
      for (const u of ogImages) if (typeof u === 'string' && u.trim()) gather.push(u.trim());
    }
    const dedup = gather.filter((v,i,a) => a.indexOf(v) === i)
  .map(u => ({ url: absUrl(u), alt: 'Purodenka - Toko Peralatan Listrik', width: 1200, height: 630 }));
    enriched = dedup.slice(0,4);
  }
  if (!enriched.length) enriched = [{ url: absUrl('logo.png'), alt: 'Purodenka - Toko Peralatan Listrik', width: 1200, height: 630 }];
  const ogPrimaryImage = enriched[0].url;
  const extraOgImages = enriched.slice(1);
  const pickImage = (prod) => {
    const candidates = [
      prod?.image,
      Array.isArray(prod?.images) ? prod.images.find((v) => typeof v === 'string' && v.trim()) : null,
      Array.isArray(prod?.gallery) ? prod.gallery.find((v) => typeof v === 'string' && v.trim()) : null,
      prod?.thumbnail,
    ].filter(Boolean);
    const chosen = candidates.find(Boolean) || `${siteUrl}logo.png`;
    return absUrl(chosen);
  };
  const pickPrice = (prod) => {
    const tierPrice = Array.isArray(prod?.tiers)
      ? Math.min(
          ...prod.tiers
            .map(t => Number(t?.price))
            .filter(n => Number.isFinite(n) && n > 0)
        )
      : null;
    const price = Number(
      prod?.retailPrice ?? prod?.price ?? tierPrice
    );
    return Number.isFinite(price) && price > 0 ? price : null;
  };

  // Use precomputed schema arrays if provided (from summary document)
  let productSchemaItems = [];
  if (Array.isArray(favoritesSchema) && favoritesSchema.length) {
    productSchemaItems = favoritesSchema.slice(0,8);
  } else {
    // Fallback: build minimal product offers from favoriteFish list
    productSchemaItems = Array.isArray(favoriteFish)
      ? favoriteFish.slice(0, 8).map((prod) => {
          const image = pickImage(prod);
          const price = pickPrice(prod);
          if (!price) return null;
          return {
            "@type": "Product",
            name: prod.name,
            image,
            description: prod.description || '',
            sku: prod.sku || prod.id,
            url: `${siteUrl}product/${prod.slug || prod.id}`,
            offers: {
              "@type": "Offer",
              price: String(price),
              priceCurrency: "IDR",
              availability: "https://schema.org/InStock"
            }
          };
        }).filter(Boolean)
      : [];
  }

  // JSON-LD Schema.org markup for SEO (ditingkatkan + USP)
  const schemaGraph = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}#org`,
    "name": "Purodenka",
      "url": siteUrl,
      "logo": `${siteUrl}logo.png`,
      "description": SEO_DESCRIPTION,
    "slogan": "Toko Peralatan Listrik & Elektronik Industri • Harga Kompetitif",
      "sameAs": [
    "https://www.instagram.com/purodenka",
    "https://facebook.com/purodenka"
      ]
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}#website`,
      "url": siteUrl,
    "name": "Purodenka",
      "publisher": { "@id": `${siteUrl}#org` },
      "inLanguage": "id-ID",
      "description": SEO_DESCRIPTION,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${siteUrl}search?query={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    },
    ...enriched.map((b, idx) => ({
      "@type": "ImageObject",
      "@id": `${siteUrl}#homepage-og-image-${idx+1}`,
      "url": b.url,
      "width": b.width,
      "height": b.height,
      "caption": b.alt
    })),
    {
      "@type": "WebPage",
      "@id": `${siteUrl}#webpage`,
      "url": siteUrl,
      "name": SEO_TITLE,
      "isPartOf": {"@id": `${siteUrl}#website`},
      "about": {"@id": `${siteUrl}#org`},
      "description": SEO_DESCRIPTION,
      "inLanguage": "id-ID",
      ...(ogPrimaryImage ? { 
        primaryImageOfPage: {"@id": `${siteUrl}#homepage-og-image-1`},
        image: {"@id": `${siteUrl}#homepage-og-image-1`}
      } : {})
    },
    {
    "@type": "Store",
  "name": "Purodenka - Toko Peralatan Listrik",
      "image": `${siteUrl}logo.png`,
      "url": siteUrl,
      "priceRange": "IDR",
      "description": SEO_DESCRIPTION,
      "address": { "@type": "PostalAddress", "addressCountry": "ID" }
    },
    ...productSchemaItems,
    productSchemaItems.length ? {
      "@type": "ItemList",
      "@id": `${siteUrl}#favorite-list`,
      itemListElement: productSchemaItems.map((p, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: p.url || undefined,
        name: p.name
      }))
    } : null
  ].filter(Boolean);
  const schemaData = { "@context": "https://schema.org", "@graph": schemaGraph };

  return (
    <div className="pt-16 min-h-screen relative">
  {/* Head debug markers removed after verification */}
      {/* Soft themed background (radial blobs + subtle vertical gradient) */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage: `
            radial-gradient(circle at 18% 25%, rgba(239,68,68,0.18), rgba(239,68,68,0) 55%),
            radial-gradient(circle at 82% 30%, rgba(185,28,28,0.14), rgba(185,28,28,0) 60%),
            radial-gradient(circle at 65% 78%, rgba(127,29,29,0.12), rgba(127,29,29,0) 55%),
            linear-gradient(to bottom, #ffffff 0%, #fff5f5 40%, #ffeaea 100%)
          `,
          backgroundAttachment: 'fixed'
        }}
      />
      {/* Optional soft pattern overlay */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.25] mix-blend-soft-light"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(239,68,68,0.08) 0 6px, transparent 6px 20px)'
        }}
      />
       <NextSeo
         defer={false}
         title={SEO_TITLE}
         description={SEO_DESCRIPTION}
         canonical={siteUrl}
         openGraph={{
           title: SEO_TITLE,
           description: SEO_DESCRIPTION,
           url: siteUrl,
           type: 'website',
           locale: 'id_ID',
           siteName: 'Purodenka',
           images: enriched.map(b => ({
             url: b.url,
             width: b.width,
             height: b.height,
             alt: b.alt
           }))
         }}
         twitter={{
           handle: '@purodenka',
           site: '@purodenka',
           cardType: 'summary_large_image'
         }}
         additionalMetaTags={[
           { name: 'keywords', content: SEO_KEYWORDS }
         ]}
       />
       <Head>
         <title>{SEO_TITLE}</title>
         <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }} />
       </Head>
  <Navbar />
 
      <main
        className="
          max-w-7xl mx-auto
          px-0 sm:px-0 mb-0
          lg:px-4
          pt-0
        "
      >
        {/* Banner */}
        <section
          className="
            mt-3
            lg:mt-4
            mb-4 px-0
            lg:rounded-2xl lg:overflow-hidden lg:shadow-lg lg:border lg:border-red-100 bg-white/0 lg:bg-white
          "
        >
          <BannerCarousel />
        </section>

        {/* Kategori */}
        <section className="mb-6 lg:mb-8">
          <CategorySection />
        </section>

  {/* Produk Terlaris & AdsImage side-by-side di desktop */}
        <section className="mb-6 lg:mb-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <div className="bg-white rounded-xl shadow-md p-4 border border-red-100">
              <FavoriteFishSection products={favoriteFish} />
            </div>
            <div className="bg-white rounded-xl shadow-md p-4 border border-red-100">
      <AdsImage />
            </div>
          </div>
        </section>

  {/* Rekomendasi (produk terendah penjualan, random pick) */}
  <Recomend items={recommendations} />
    <HomeArticles articles={articles} />

        {/* Visit Our Farm (desktop side-by-side, mobile stack) */}
  <VisitOurFarm info={farmInfo} />

      </main>
      <Footer />
      {/* Chat icon di homepage dinonaktifkan sesuai permintaan */}
      <PopupCart
        show={showCartPopup}
        onClose={() => setShowCartPopup(false)}
        product={selectedProduct}
      />
     </div>
  );
};


export default Homepage;

// Ambil gambar banner untuk Open Graph/Twitter dari koleksi 'banners' dan produk favorit dari Firestore
export async function getStaticProps() {
  let ogImage = null;
  let ogImages = [];
  let favoriteFish = [];
  let recommendations = [];
  let bannerMeta = [];
  let favoritesSchema = [];
  let recommendationsSchema = [];
  let articles = [];
  const farmInfo = {
  storeName: process.env.NEXT_PUBLIC_STORE_NAME || 'Purodenka',
    contactName: process.env.NEXT_PUBLIC_BITESHIP_SHIPPER_NAME || '',
    phone: process.env.NEXT_PUBLIC_BITESHIP_SHIPPER_PHONE || '',
    email: process.env.NEXT_PUBLIC_BITESHIP_SHIPPER_EMAIL || '',
    address: process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_ADDRESS || '',
    postal: process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_POSTAL || '',
    lat: process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LAT || null,
    lng: process.env.NEXT_PUBLIC_BITESHIP_ORIGIN_LNG || null
  };
  try {
    const now = Date.now();
    const snap = await adminDb.collection('banners').get();
    const raw = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      const start = data.startDate ? Date.parse(data.startDate) : null;
      const end = data.endDate ? Date.parse(data.endDate) : null;
      const active = (!start || start <= now) && (!end || end >= now);
      if (!active) return;
      const priority = typeof data.priority === 'number' ? data.priority : 0;
      const width = Number(data.width) || 1200;
      const height = Number(data.height) || 630;
      const alts = Array.isArray(data.alts) ? data.alts : [];
      if (Array.isArray(data.images)) {
        data.images.forEach((u, idx) => {
              if (typeof u === 'string' && u.trim()) {
            raw.push({
              url: u.trim(),
                  alt: alts[idx] || 'Homepage Banner Purodenka',
              width,
              height,
              priority,
              order: idx,
              createdAt: data.createdAt?.toMillis?.() || 0
            });
          }
        });
      }
    });
    raw.sort((a,b) => (b.priority - a.priority) || (b.createdAt - a.createdAt) || (a.order - b.order));
    const seen = new Set();
    for (const r of raw) {
      if (bannerMeta.length >= 4) break;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      bannerMeta.push({ url: r.url, alt: r.alt, width: r.width, height: r.height });
      ogImages.push(r.url);
    }
    ogImage = bannerMeta[0]?.url || null;

    // Attempt to load precomputed daily layout summary
    let summaryDoc = null;
    try {
      const doc = await adminDb.collection('layout_summaries').doc('latest').get();
      if (doc.exists) summaryDoc = doc.data();
    } catch (e) {
      // ignore summary errors, fallback below
    }
    if (summaryDoc) {
      favoriteFish = Array.isArray(summaryDoc.favorites) ? summaryDoc.favorites : [];
      recommendations = Array.isArray(summaryDoc.recommendations) ? summaryDoc.recommendations : [];
      favoritesSchema = Array.isArray(summaryDoc.favoritesSchema) ? summaryDoc.favoritesSchema : [];
      recommendationsSchema = Array.isArray(summaryDoc.recommendationsSchema) ? summaryDoc.recommendationsSchema : [];
    } else {
      // Fallback: on-demand minimal build (kept until summary function fully reliable)
      const productsSnap = await adminDb.collection('products').get();
      const lean = [];
      productsSnap.forEach(doc => {
        const d = doc.data() || {};
        const firstImage = Array.isArray(d.images) ? d.images.find(i => typeof i === 'string' && i.trim()) : (typeof d.image === 'string' ? d.image : null);
        let sizeVariants = [];
        if (Array.isArray(d.sizeVariants) && d.sizeVariants.length) {
          sizeVariants = d.sizeVariants.map(v => ({
            size: v.size ?? null,
            priceRetail: v.priceRetail ?? v.price_retail ?? null,
            priceWholesale: v.priceWholesale ?? v.price_wholesale ?? null,
            weight: v.weight != null ? Number(v.weight) : null
          })).filter(v => v.priceRetail != null || v.priceWholesale != null);
        } else {
          const retail = d.priceRetail ?? d.price_retail ?? null;
          const wholesale = d.priceWholesale ?? d.price_wholesale ?? null;
          if (retail != null || wholesale != null) {
            sizeVariants = [{ size: null, priceRetail: retail ?? null, priceWholesale: wholesale ?? null, weight: d.weight != null ? Number(d.weight) : null }];
          }
        }
        lean.push({
          id: doc.id,
          name: d.name || '',
          productSlug: d.productSlug || d.slug || (d.name ? d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') : doc.id),
          slug: d.slug || d.productSlug || null,
          image: firstImage || null,
          images: firstImage ? [firstImage] : [],
            sizeVariants,
          discount: d.discount || 0,
          rating: d.rating || null,
          sold: d.sold || d.salesCount || 0,
          minWholesale: d.minWholesale || d.min_wholesale || d.min_wholesale_qty || null,
          weight: d.weight != null ? Number(d.weight) : null,
          video: d.video || null
        });
      });
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
      const filtered = lean.filter(p => !isExcluded(p));
      const shuffle = arr => arr.sort(() => Math.random() - 0.5);
      favoriteFish = shuffle([...filtered]).slice(0, 8);
      recommendations = shuffle([...filtered]).slice(0, 12);
    }

    const articleSnap = await adminDb.collection('articles').orderBy('createdAt', 'desc').limit(4).get();
    articleSnap.forEach(doc => {
      const data = doc.data() || {};
      articles.push({
        id: doc.id,
        slug: data.slug || doc.id,
        title: data.title || '',
        excerpt: data.excerpt || '',
        image: data.image || '',
        category: data.category || '',
        author: data.author || '',
        date: data.date || data.createdAt || null,
      });
    });
  } catch (e) {
    // fallback handled by component
  }
  return { props: { ogImage, ogImages, favoriteFish, recommendations, bannerMeta, farmInfo, favoritesSchema, recommendationsSchema, articles }, revalidate: 300 };
}