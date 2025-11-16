import Head from "next/head";
import Link from "next/link";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
} from "firebase/firestore";
import { firestore } from "@/utils/firebase";
import LatestArticles from "@/components/LatestArticles";
import Trending from "@/components/Trending";
import ProductSuggest from "@/components/ProductSuggest";
import Footer from '@/components/Footer';

// Helper serialisasi Firestore
function serializeObject(obj) {
  const result = {};
  for (const key in obj) {
    const value = obj[key];
    if (value && typeof value === "object" && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = serializeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
function serializeDoc(doc) {
  const data = doc.data();
  const result = { id: doc.id };
  for (const key in data) {
    const value = data[key];
    if (value && typeof value === "object" && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = serializeObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Helper untuk ambil n produk acak dari array
function getRandomProducts(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

export default function ArticleDetail({ article, related, latest, trending, products }) {
  if (!article) {
    return (
      <div className="p-8 text-center text-red-600">
        Artikel tidak ditemukan
      </div>
    );
  }

  // SEO
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.purodenka.com";
  const pageUrl = `${siteUrl.replace(/\/$/, "")}/article/${article.slug}`;
  const published = article.createdAt || new Date().toISOString();
  const modified = article.updatedAt || published;
  const image = article.image || `${siteUrl}/images/default-article.jpg`;
  const description =
    article.excerpt ||
    (article.contentText ? article.contentText.slice(0, 160) : "");
  const keywords = Array.isArray(article.keywords)
    ? article.keywords.join(", ")
    : article.keywords || "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    headline: article.title,
    description,
    image: [image],
    author: { "@type": "Person", name: article.author || "Purodenka" },
    publisher: {
      "@type": "Organization",
      name: "Purodenka",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png` },
    },
    datePublished: published,
    dateModified: modified,
    articleSection: article.category || "",
    keywords,
  };

  // konsisten kategori termasuk platy
  const categories = [
    { slug: "manfish", name: "Ikan Manfish" },
    { slug: "cichlid", name: "Ikan Cichlid" },
    { slug: "guppy", name: "Ikan Guppy" },
    { slug: "cupang", name: "Ikan Cupang" },
    { slug: "platy", name: "Ikan Platy" },
  ];

  return (
    <>
      <Head>
        <title>{article.title} | Purodenka</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:url" content={pageUrl} />
        <meta property="article:published_time" content={published} />
        <meta property="article:modified_time" content={modified} />
        {article.category && (
          <meta property="article:section" content={article.category} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </Head>

  <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Related */}
            <aside className="lg:w-1/4 w-full order-1 mb-8 lg:mb-0">
              <div className="sticky top-24 bg-white/90 rounded-xl border border-red-100 shadow-md p-4">
                <h2 className="text-lg font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Artikel Terkait
                </h2>
                {related.length === 0 ? (
                  <div className="text-gray-500 text-sm">
                    Tidak ada artikel terkait.
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {related.map((a) => (
                      <li key={a.id}>
                        <Link
                          href={`/article/${a.slug}`}
                          className="flex gap-3 group"
                        >
                          <img
                            src={a.image || "/images/default-article.jpg"}
                            alt={a.title}
                            className="w-14 h-14 object-cover rounded-lg border shadow-sm group-hover:scale-110 group-hover:shadow-lg transition"
                          />
                          <div>
                            <div className="font-semibold group-hover:text-primary transition line-clamp-2">
                              {a.title}
                            </div>
                            <div className="text-xs text-gray-400">
                              {a.author} &middot;{" "}
                              {a.createdAt
                                ? new Date(a.createdAt).toLocaleDateString(
                                    "id-ID"
                                  )
                                : ""}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            {/* Main */}
            <section className="lg:w-2/4 w-full order-2 bg-white/95 rounded-xl shadow-lg p-6 border border-red-50">
              {/* ProductSuggest di atas artikel */}
              <ProductSuggest products={products} />

              <Link
                href="/article"
                className="inline-block text-primary font-semibold hover:bg-primary hover:text-white px-3 py-1 rounded transition mb-4"
              >
                &larr; Kembali ke artikel
              </Link>
              <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {article.title}
              </h1>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700 uppercase">
                  {categories.find((c) => c.slug === article.category)?.name ||
                    article.category}
                </span>
                <span className="text-sm text-gray-500">
                  {article.author} &middot;{" "}
                  {article.createdAt
                    ? new Date(article.createdAt).toLocaleDateString("id-ID")
                    : ""}
                </span>
              </div>
              {article.image && (
                <div className="rounded-xl overflow-hidden mb-6 shadow aspect-w-16 aspect-h-9 bg-gradient-to-br from-red-100 to-pink-100">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover hover:scale-105 transition"
                  />
                </div>
              )}
              <div
                className="prose max-w-full article-content text-gray-800"
                dangerouslySetInnerHTML={{ __html: article.content || "" }}
              />

              <div className="mt-12">
                <h2 className="text-lg font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Artikel Terbaru
                </h2>
                <LatestArticles articles={latest} categories={categories} />
              </div>
            </section>
            <Footer />

            {/* Trending */}
            <aside className="lg:w-1/4 w-full order-3">
              <div className="sticky top-24 bg-white/90 rounded-xl border border-pink-100 shadow-md p-4">
                <h2 className="text-lg font-bold mb-4 bg-gradient-to-r from-pink-500 to-yellow-500 bg-clip-text text-transparent">
                  Artikel Trending
                </h2>
                <Trending articles={trending} />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .article-content h1 {
          font-size: 2rem;
          line-height: 1.15;
          margin-top: 1.2rem;
          margin-bottom: 0.6rem;
          font-weight: 700;
        }
        .article-content h2 {
          font-size: 1.5rem;
          line-height: 1.2;
          margin-top: 1.1rem;
          margin-bottom: 0.5rem;
          font-weight: 600;
        }
        .article-content h3 {
          font-size: 1.25rem;
          line-height: 1.25;
          margin-top: 1rem;
          margin-bottom: 0.45rem;
          font-weight: 600;
        }
        @media (min-width: 1024px) {
          .article-content h1 {
            font-size: 2.5rem;
          }
          .article-content h2 {
            font-size: 1.75rem;
          }
          .article-content h3 {
            font-size: 1.375rem;
          }
        }
        .article-content p {
          margin-bottom: 1rem;
        }
        .article-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
        }
      `}</style>
    </>
  );
}

export async function getStaticPaths() {
  const snapshot = await getDocs(collection(firestore, "articles"));
  const paths = snapshot.docs.map((doc) => ({
    params: { slug: doc.data().slug },
  }));

  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const { slug } = params;

  // Ambil artikel
  const q = query(collection(firestore, "articles"), where("slug", "==", slug));
  const snap = await getDocs(q);
  if (snap.empty) return { notFound: true };
  const article = serializeDoc(snap.docs[0]);

  // Related, latest, trending
  let related = [];
  if (article.category) {
    const relatedQ = query(
      collection(firestore, "articles"),
      where("category", "==", article.category),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const relatedSnap = await getDocs(relatedQ);
    related = relatedSnap.docs
      .map(serializeDoc)
      .filter((a) => a.slug !== slug);
  }

  const latestQ = query(
    collection(firestore, "articles"),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const latestSnap = await getDocs(latestQ);
  const latest = latestSnap.docs
    .map(serializeDoc)
    .filter((a) => a.slug !== slug);

  const trendingQ = query(
    collection(firestore, "articles"),
    orderBy("createdAt", "desc"),
    limit(4)
  );
  const trendingSnap = await getDocs(trendingQ);
  const trending = trendingSnap.docs
    .map(serializeDoc)
    .filter((a) => a.slug !== slug);

  // Ambil produk dari koleksi products
  const productSnap = await getDocs(collection(firestore, "products"));
  let allProducts = productSnap.docs.map((doc) => ({
    ...serializeDoc(doc)
  }));

  // Ambil 4 produk random untuk desktop, 2 untuk mobile (ProductSuggest handle slice)
  // Kirim 4 produk ke ProductSuggest, nanti komponen akan slice sendiri
  const products = getRandomProducts(allProducts, 4);

  return {
    props: { article, related, latest, trending, products },
    revalidate: 60,
  };
}