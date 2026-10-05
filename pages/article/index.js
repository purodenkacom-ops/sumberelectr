import Head from 'next/head'
import Link from 'next/link'
import ArticleHeader from '@/components/ArticleHeader'
import LatestArticles from '@/components/LatestArticles'
import Trending from '@/components/Trending'
import { supabaseAdmin } from '@/utils/supabaseAdmin'
import { useState, useEffect } from 'react'

function serializeArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug || '',
    title: row.title || '',
    excerpt: row.excerpt || '',
    image: row.image || '',
    category: row.category || '',
    author: row.author || 'Purodenka',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

export async function getStaticProps() {
  try {
    // Ambil kategori dari Supabase
    const { data: catRows } = await supabaseAdmin
      .from('categories')
      .select('slug, name')
      .order('name');

    const categories = (catRows || []).map(c => ({
      slug: c.slug || '',
      name: c.name || c.slug || ''
    }));

    // Ambil artikel
    const { data: articleRows, error: articleError } = await supabaseAdmin
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (articleError) throw articleError;

    const articles = (articleRows || []).map(serializeArticle);

    return {
      props: {
        articles,
        categories,
      },
      revalidate: 86400,
    }
  } catch (err) {
    console.error('SSG fetch error:', err)
    return {
      props: {
        articles: [],
        categories: [],
      },
      revalidate: 86400,
    }
  }
}

export default function ArticlePage({ articles, categories }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [filtered, setFiltered] = useState(articles)

  useEffect(() => {
    let result = articles
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(a =>
        (a.title || '').toLowerCase().includes(term) ||
        (a.excerpt || '').toLowerCase().includes(term)
      )
    }
    if (selectedCategory) {
      result = result.filter(a => a.category === selectedCategory)
    }
    setFiltered(result)
  }, [searchTerm, selectedCategory, articles])

  return (
    <>
      <Head>
        <title>Artikel & Tips | Purodenka</title>
        <meta name="description" content="Kumpulan artikel, tips, dan panduan seputar ikan hias, perawatan akuarium, dan produk terbaik dari Purodenka." />
        <meta property="og:title" content="Artikel & Tips | Purodenka" />
        <meta property="og:description" content="Kumpulan artikel, tips, dan panduan seputar ikan hias, perawatan akuarium, dan produk terbaik dari Purodenka." />
        <meta property="og:type" content="website" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        <ArticleHeader />

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Search & Filter */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Cari artikel..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="md:w-48">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Semua Kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              {filtered.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <p className="text-gray-500 text-lg">Tidak ada artikel yang ditemukan.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filtered.map((article) => (
                    <article
                      key={article.id}
                      className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <Link href={`/article/${article.slug}`}>
                        <div className="flex flex-col md:flex-row">
                          {article.image && (
                            <div className="md:w-64 h-48 md:h-auto flex-shrink-0">
                              <img
                                src={article.image}
                                alt={article.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="p-6 flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {article.category && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                  {article.category}
                                </span>
                              )}
                              <span className="text-gray-400 text-sm">
                                {new Date(article.createdAt).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 mb-2 hover:text-blue-600 transition-colors">
                              {article.title}
                            </h2>
                            <p className="text-gray-600 line-clamp-2">
                              {article.excerpt}
                            </p>
                            <div className="mt-4 flex items-center text-blue-600 font-medium">
                              Baca selengkapnya
                              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="space-y-6">
              {/* Categories */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="font-bold text-gray-900 mb-4">Kategori</h3>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.slug}
                      onClick={() => setSelectedCategory(
                        selectedCategory === cat.slug ? '' : cat.slug
                      )}
                      className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                        selectedCategory === cat.slug
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-gray-400 text-sm">
                        {selectedCategory === cat.slug ? '✓' : '→'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Latest Articles */}
              <LatestArticles articles={articles.slice(0, 5)} />

              {/* Trending */}
              <Trending articles={articles.slice(0, 4)} />
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}
