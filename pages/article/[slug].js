import Head from "next/head";
import Link from "next/link";
import LatestArticles from "@/components/LatestArticles";
import Trending from "@/components/Trending";
import ProductSuggest from "@/components/ProductSuggest";
import Footer from '@/components/Footer';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

// Helper serialisasi Supabase
function serializeArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug || '',
    title: row.title || '',
    content: row.content || '',
    contentText: row.content_text || row.contentText || '',
    excerpt: row.excerpt || '',
    image: row.image || '',
    category: row.category || '',
    author: row.author || 'Purodenka',
    keywords: row.keywords || [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
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
  const pageUrl = `${siteUrl.replace(/\/+$/, "")}/article/${article.slug}`;
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
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={image} />
        <meta property="article:published_time" content={published} />
        <meta property="article:modified_time" content={modified} />
        <meta property="article:section" content={article.category || ""} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb */}
        <nav className="bg-white border-b" aria-label="Breadcrumb">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <ol className="flex items-center space-x-2 text-sm text-gray-600">
              <li>
                <Link href="/" className="hover:text-blue-600 transition-colors">
                  Beranda
                </Link>
              </li>
              <li>
                <span className="text-gray-400">/</span>
              </li>
              <li>
                <Link href="/article" className="hover:text-blue-600 transition-colors">
                  Artikel
                </Link>
              </li>
              <li>
                <span className="text-gray-400">/</span>
              </li>
              <li className="text-gray-800 font-medium truncate max-w-xs">
                {article.title}
              </li>
            </ol>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <article className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Featured Image */}
                {article.image && (
                  <div className="relative h-64 md:h-96 w-full">
                    <img
                      src={article.image}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-6 md:p-8">
                  {/* Category & Meta */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {article.category && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                        {article.category}
                      </span>
                    )}
                    <span className="text-gray-500 text-sm">
                      {new Date(published).toLocaleDateString('id-ID', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>

                  {/* Title */}
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                    {article.title}
                  </h1>

                  {/* Author */}
                  <div className="flex items-center gap-3 mb-6 pb-6 border-b">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                      {(article.author || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{article.author || 'Purodenka'}</p>
                      <p className="text-sm text-gray-500">Penulis</p>
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-blue-600 prose-img:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: article.content || article.contentText || '' }}
                  />

                  {/* Tags */}
                  {article.keywords && article.keywords.length > 0 && (
                    <div className="mt-8 pt-6 border-t">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Tags:</h3>
                      <div className="flex flex-wrap gap-2">
                        {article.keywords.map((tag, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Related Articles */}
              {related && related.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Artikel Terkait</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {related.map((item) => (
                      <Link
                        key={item.id}
                        href={`/article/${item.slug}`}
                        className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {item.image && (
                          <div className="h-40 w-full">
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="p-4">
                          <h3 className="font-semibold text-gray-900 line-clamp-2">{item.title}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {new Date(item.createdAt).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </article>

            {/* Sidebar */}
            <aside className="space-y-6">
              {/* Categories */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">Kategori</h3>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <Link
                      key={cat.slug}
                      href={`/article?category=${cat.slug}`}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-gray-700">{cat.name}</span>
                      <span className="text-gray-400 text-sm">→</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Latest Articles */}
              {latest && latest.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 mb-4">Artikel Terbaru</h3>
                  <div className="space-y-4">
                    {latest.map((item) => (
                      <Link
                        key={item.id}
                        href={`/article/${item.slug}`}
                        className="flex gap-3 group"
                      >
                        {item.image && (
                          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                            <img
                              src={item.image}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                        )}
                        <div>
                          <h4 className="font-medium text-gray-900 text-sm line-clamp-2 group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.createdAt).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              {trending && trending.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 mb-4">Trending</h3>
                  <div className="space-y-3">
                    {trending.map((item, i) => (
                      <Link
                        key={item.id}
                        href={`/article/${item.slug}`}
                        className="flex items-start gap-3 group"
                      >
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                          {i + 1}
                        </span>
                        <h4 className="text-sm text-gray-700 group-hover:text-blue-600 transition-colors line-clamp-2">
                          {item.title}
                          </h4>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Suggestions */}
              {products && products.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 mb-4">Produk Rekomendasi</h3>
                  <ProductSuggest products={products} />
                </div>
              )}
            </aside>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  try {
    const { data: articles } = await supabaseAdmin
      .from('articles')
      .select('slug');

    const paths = (articles || []).map((a) => ({
      params: { slug: a.slug },
    }));

    return { paths, fallback: "blocking" };
  } catch (err) {
    console.error('getStaticPaths error:', err);
    return { paths: [], fallback: "blocking" };
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params;

  try {
    // Ambil artikel
    const { data: articleRow, error: articleError } = await supabaseAdmin
      .from('articles')
      .select('*')
      .eq('slug', slug)
      .single();

    if (articleError || !articleRow) {
      return { notFound: true, revalidate: 86400 };
    }

    const article = serializeArticle(articleRow);

    // Related articles (same category)
    let related = [];
    if (article.category) {
      const { data: relatedRows } = await supabaseAdmin
        .from('articles')
        .select('*')
        .eq('category', article.category)
        .neq('slug', slug)
        .order('created_at', { ascending: false })
        .limit(5);
      related = (relatedRows || []).map(serializeArticle);
    }

    // Latest articles
    const { data: latestRows } = await supabaseAdmin
      .from('articles')
      .select('*')
      .neq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(5);
    const latest = (latestRows || []).map(serializeArticle);

    // Trending articles
    const { data: trendingRows } = await supabaseAdmin
      .from('articles')
      .select('*')
      .neq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(4);
    const trending = (trendingRows || []).map(serializeArticle);

    // Products
    const { data: productRows } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(4);
    const products = (productRows || []).map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug || p.product_slug,
      price: p.price_retail || p.price || 0,
      image: Array.isArray(p.images) ? p.images[0] : (p.image || ''),
    }));

    return {
      props: { article, related, latest, trending, products },
      revalidate: 86400,
    };
  } catch (err) {
    console.error('getStaticProps error:', err);
    return { notFound: true, revalidate: 86400 };
  }
}
