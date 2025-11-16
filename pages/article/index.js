import Head from 'next/head'
import Link from 'next/link'
import ArticleHeader from '@/components/ArticleHeader'
import LatestArticles from '@/components/LatestArticles'
import Trending from '@/components/Trending'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { firestore } from '@/utils/firebase'
import { useState, useEffect } from 'react'

// Ambil kategori dari Firestore agar dinamis
export async function getStaticProps() {
  try {
    // Ambil kategori dinamis
    const catSnap = await getDocs(collection(firestore, 'categories'))
    const categories = catSnap.docs.map(d => {
      const data = d.data()
      return {
        slug: data.slug || d.id,
        name: data.name || data.slug || d.id
      }
    })

    // Ambil artikel
    const q = query(collection(firestore, 'articles'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    const docs = snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null,
        date: data.date?.toDate ? data.date.toDate().toISOString() : data.date || null,
      }
    })

    return {
      props: {
        articles: docs,
        categories,
      },
      revalidate: 60,
    }
  } catch (err) {
    console.error('SSG fetch error:', err)
    return {
      props: {
        articles: [],
        categories: [],
      },
      revalidate: 60,
    }
  }
}

export default function ArticleIndex({ articles = [], categories = [] }) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [search, setSearch] = useState('')
  const [showCatMobile, setShowCatMobile] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [isMobile, setIsMobile] = useState(false)

  // Responsive pageSize dan flag mobile
  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setPageSize(mobile ? 6 : 10)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Filter artikel by kategori dan search
  const filteredArticles = articles.filter(a =>
    (selectedCategory === '' || a.category === selectedCategory) &&
    (
      (a.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.excerpt || '').toLowerCase().includes(search.toLowerCase())
    )
  )

  // Pagination logic
  const totalPages = Math.ceil(filteredArticles.length / pageSize)
  const paginatedArticles = filteredArticles.slice((page - 1) * pageSize, page * pageSize)

  const featured = articles[0]
  const featuredList = articles.slice(1, 4)
  const trending = articles.slice(0, 4)

  return (
    <>
      <Head>
        <title>Artikel Teknik & Kelistrikan | Purodenka</title>
        <meta
          name="description"
          content="Kumpulan artikel seputar teknik listrik, panel, otomasi industri, tips instalasi, dan panduan produk peralatan listrik."
        />
      </Head>
      <main className="min-h-screen bg-white px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <ArticleHeader search={search} setSearch={setSearch} />
          <div className="flex flex-col md:flex-row gap-8">
            
            {/* Sidebar kategori */}
            <aside className="hidden md:block md:w-1/5 w-full">
              <div className="sticky top-24">
                <div className="mb-4 font-bold text-lg text-primary">
                  Kategori Artikel
                </div>
                <ul className="space-y-2">
                  <li>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-lg font-semibold transition ${
                        selectedCategory === ''
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-primary hover:bg-primary/10'
                      }`}
                      onClick={() => setSelectedCategory('')}
                    >
                      Semua Kategori
                    </button>
                  </li>
                  {categories.length > 0 && categories.map(cat => (
                    <li key={cat.slug}>
                      <button
                        className={`w-full text-left px-4 py-2 rounded-lg font-semibold transition ${
                          selectedCategory === cat.slug
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-primary hover:bg-primary/10'
                        }`}
                        onClick={() => setSelectedCategory(cat.slug)}
                      >
                        {cat.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* Mobile kategori */}
            <div className="md:hidden mb-4">
              <button
                className="w-full px-4 py-2 rounded-lg bg-primary text-white font-semibold flex justify-between items-center"
                onClick={() => setShowCatMobile(v => !v)}
              >
                {selectedCategory
                  ? categories.find(c => c.slug === selectedCategory)?.name
                  : 'Pilih Kategori'}
                <svg
                  className={`ml-2 w-5 h-5 transition-transform ${
                    showCatMobile ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M19 9l-7 7-7-7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {showCatMobile && (
                <ul className="mt-2 bg-white border rounded-lg shadow space-y-1 py-2">
                  <li>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-lg font-semibold transition ${
                        selectedCategory === ''
                          ? 'bg-primary text-white'
                          : 'hover:bg-primary/10 text-primary'
                      }`}
                      onClick={() => {
                        setSelectedCategory('')
                        setShowCatMobile(false)
                      }}
                    >
                      Semua Kategori
                    </button>
                  </li>
                  {categories.length > 0 && categories.map(cat => (
                    <li key={cat.slug}>
                      <button
                        className={`w-full text-left px-4 py-2 rounded-lg font-semibold transition ${
                          selectedCategory === cat.slug
                            ? 'bg-primary text-white'
                            : 'hover:bg-primary/10 text-primary'
                        }`}
                        onClick={() => {
                          setSelectedCategory(cat.slug)
                          setShowCatMobile(false)
                        }}
                      >
                        {cat.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Konten utama */}
            <section className="md:w-4/5 w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold mb-3">Featured Posts</h2>
                    {featured ? (
                      <Link
                        href={`/article/${featured.slug}`}
                        className="group flex gap-4 mb-4"
                      >
                        <img
                          src={featured.image || '/images/default-article.jpg'}
                          alt={featured.title}
                          className="w-32 h-32 object-cover rounded-lg border"
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-bold group-hover:text-primary transition">
                            {featured.title}
                          </h3>
                          <p className="text-gray-600 text-sm mb-2">
                            {featured.excerpt}
                          </p>
                          <div className="text-xs text-gray-400">
                            {featured.author} &middot;{' '}
                            {featured.date
                              ? new Date(featured.date).toLocaleDateString(
                                  'id-ID'
                                )
                              : ''}
                          </div>
                        </div>
                      </Link>
                    ) : (
                      <div>Tidak ada artikel</div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {featuredList.map(article => (
                        <Link
                          key={article.id}
                          href={`/article/${article.slug}`}
                          className="group flex gap-3"
                        >
                          <img
                            src={article.image || '/images/default-article.jpg'}
                            alt={article.title}
                            className="w-20 h-20 object-cover rounded-lg border"
                          />
                          <div>
                            <h4 className="font-semibold group-hover:text-primary transition">
                              {article.title}
                            </h4>
                            <div className="text-xs text-gray-400">
                              {article.author} &middot;{' '}
                              {article.date
                                ? new Date(article.date).toLocaleDateString(
                                    'id-ID'
                                  )
                                : ''}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>

                  <LatestArticles
                    articles={paginatedArticles}
                    categories={categories}
                  />

                  {/* Pagination controls */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-6">
                      <button
                        className="px-3 py-1 rounded bg-gray-100 text-primary font-semibold disabled:opacity-50"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        &larr; Prev
                      </button>

                      {/* Mobile: tampilkan max 5 page, Desktop: semua */}
                      {(() => {
                        if (isMobile) {
                          const maxPages = 5
                          let start = Math.max(1, page - Math.floor(maxPages / 2))
                          let end = start + maxPages - 1
                          if (end > totalPages) {
                            end = totalPages
                            start = Math.max(1, end - maxPages + 1)
                          }
                          return Array.from({ length: end - start + 1 }, (_, i) => {
                            const p = start + i
                            return (
                              <button
                                key={p}
                                className={`px-3 py-1 rounded font-semibold ${
                                  page === p
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-100 text-primary hover:bg-primary/10'
                                }`}
                                onClick={() => setPage(p)}
                              >
                                {p}
                              </button>
                            )
                          })
                        }

                        // Desktop
                        return Array.from({ length: totalPages }, (_, i) => {
                          const p = i + 1
                          return (
                            <button
                              key={p}
                              className={`px-3 py-1 rounded font-semibold ${
                                page === p
                                  ? 'bg-primary text-white'
                                  : 'bg-gray-100 text-primary hover:bg-primary/10'
                              }`}
                              onClick={() => setPage(p)}
                            >
                              {p}
                            </button>
                          )
                        })
                      })()}

                      <button
                        className="px-3 py-1 rounded bg-gray-100 text-primary font-semibold disabled:opacity-50"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        Next &rarr;
                      </button>
                    </div>
                  )}
                </div>

                <div className="md:col-span-1">
                  <Trending articles={trending} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
