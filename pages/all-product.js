import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Head from 'next/head';
import MiniNavbar from '@/components/MiniNavbar';
import ProductCard from '@/components/ProductCard';
import ProductSortBar from '@/components/ProductSortBar';
import ProductSidebar from '@/components/ProductSidebar';
import Footer from '@/components/Footer';
import { FaChevronDown } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';
import { useCategories } from '@/hooks/useCategories';

const AllProductPage = () => {
  const { user } = useAuth();
  const { categories } = useCategories();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [priceSort, setPriceSort] = useState('none');
  const [promoOnly, setPromoOnly] = useState(false);
  const [sortMode, setSortMode] = useState('default');
  const [page, setPage] = useState(1);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [pageSize, setPageSize] = useState(16);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setPageSize(window.innerWidth < 1024 ? 8 : 16);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sort: sortMode,
        promoOnly: promoOnly ? 'true' : 'false',
      });
      if (categoryFilter) params.append('category', categoryFilter);
      if (subCategoryFilter) params.append('subCategory', subCategoryFilter);

      const res = await fetch(`/api/products/paged?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load products', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortMode, promoOnly, categoryFilter, subCategoryFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSortModeChange = (mode) => {
    setSortMode(mode);
    if (mode === 'price-asc') setPriceSort('asc');
    else if (mode === 'price-desc') setPriceSort('desc');
    else setPriceSort('none');
    setPage(1);
  };

  const handlePriceSortChange = (val) => {
    setPriceSort(val);
    if (val === 'asc') setSortMode('price-asc');
    else if (val === 'desc') setSortMode('price-desc');
    else setSortMode('default');
    setPage(1);
  };

  const activeCategory = useMemo(() => {
    return categories.find(c => c.name === categoryFilter && !(c.parentId || c.parent_id));
  }, [categories, categoryFilter]);

  const activeCategorySlug = activeCategory?.slug || '';

  const activeSubCategory = useMemo(() => {
    if (!activeCategory) return null;
    return categories.find(c => c.name === subCategoryFilter && (c.parentId === activeCategory.id || c.parent_id === activeCategory.id));
  }, [categories, subCategoryFilter, activeCategory]);

  const activeSubCategorySlug = activeSubCategory?.slug || '';

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": products.map((p, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "url": `/product/${p.productSlug || p.product_slug || p.slug || p.id}`,
      "name": p.name,
      "image": p.image || (Array.isArray(p.images) ? p.images[0] : undefined) || '',
      "offers": {
        "@type": "Offer",
        "price": Number(p.priceRetail || p.price_retail || p.price || 0),
        "priceCurrency": "IDR",
        "availability": "https://schema.org/InStock"
      }
    }))
  };

  return (
    <div className="min-h-screen bg-gray-50 mt-[-26]">
      <Head>
        <title>Semua Produk - Purodenka</title>
        <meta name="description" content="Jelajahi semua peralatan listrik dan elektronik industri di Purodenka. Filter kategori, urutkan berdasarkan harga, dan temukan promo terbaik." />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      </Head>

      <div className="sticky top-4 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <MiniNavbar />
        </div>
      </div>

      <main
        className={
          typeof window !== 'undefined' && window.innerWidth < 1024
            ? "max-w-7xl mx-auto px-2 mr-[-60px] py-6 mt-4"
            : "max-w-7xl mx-auto px-4 py-6 mt-4"
        }
      >
        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 lg:items-start">
          <div className="hidden lg:block lg:sticky lg:top-20">
            <ProductSidebar
              currentCategorySlug={activeCategorySlug}
              currentSubCategorySlug={activeSubCategorySlug}
              onCategorySelect={(name, slug) => {
                setCategoryFilter(name);
                setSubCategoryFilter('');
                setPage(1);
              }}
              onSubCategorySelect={(name, slug) => {
                setSubCategoryFilter(name);
                setPage(1);
              }}
              onClearFilters={() => {
                setCategoryFilter('');
                setSubCategoryFilter('');
                setPage(1);
              }}
            />
          </div>

          <ProductSidebar
            isMobile
            isOpen={isMobileSidebarOpen}
            onClose={() => setIsMobileSidebarOpen(false)}
            currentCategorySlug={activeCategorySlug}
            currentSubCategorySlug={activeSubCategorySlug}
            onCategorySelect={(name, slug) => {
              setCategoryFilter(name);
              setSubCategoryFilter('');
              setPage(1);
              setIsMobileSidebarOpen(false);
            }}
            onSubCategorySelect={(name, slug) => {
              setSubCategoryFilter(name);
              setPage(1);
              setIsMobileSidebarOpen(false);
            }}
            onClearFilters={() => {
              setCategoryFilter('');
              setSubCategoryFilter('');
              setPage(1);
              setIsMobileSidebarOpen(false);
            }}
          />

          <div>
            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h1 className="text-2xl font-bold text-red-700">Semua Produk</h1>

              <div className="w-full md:w-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 w-full">
                  <button
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="flex items-center justify-between gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 shadow-sm active:scale-[0.98] transition-all w-full sm:w-auto cursor-pointer"
                  >
                    <span className="truncate">
                      Kategori: {categoryFilter ? `${categoryFilter}${subCategoryFilter ? ` › ${subCategoryFilter}` : ''}` : 'Semua'}
                    </span>
                    <FaChevronDown size={10} className="text-gray-400" />
                  </button>

                  <select
                    value={priceSort}
                    onChange={e => handlePriceSortChange(e.target.value)}
                    className="px-3 py-2 border rounded-lg bg-white w-full sm:w-auto min-w-0 lg:hidden"
                  >
                    <option value="none">Urutkan: Default</option>
                    <option value="asc">Harga: Terendah</option>
                    <option value="desc">Harga: Tertinggi</option>
                  </select>

                  <label className="inline-flex items-center gap-2 self-start sm:self-center">
                    <input type="checkbox" checked={promoOnly} onChange={e => { setPromoOnly(e.target.checked); setPage(1); }} className="form-checkbox h-4 w-4 text-orange-600" />
                    <span className="text-sm">Promo</span>
                  </label>
                </div>
              </div>
            </div>

            <ProductSortBar
              activeSort={sortMode}
              onSortChange={handleSortModeChange}
              totalCount={totalCount}
            />

            {subCategoryFilter && (
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Filter Aktif:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-full border border-red-100">
                  {subCategoryFilter}
                  <button 
                    onClick={() => {
                      setSubCategoryFilter('');
                      setPage(1);
                    }}
                    className="hover:text-red-900 font-bold ml-1 cursor-pointer focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}

            <div className="mb-4 text-sm text-gray-600">
              Menampilkan {products.length} dari {totalCount} produk
            </div>

            {loading ? (
              <div className="text-gray-500">Memuat produk...</div>
            ) : products.length === 0 ? (
              <div className="text-gray-500">Tidak ada produk sesuai filter.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {products.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                <div className="flex justify-center items-center gap-4 mt-6">
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50 cursor-pointer"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Prev
                  </button>
                  <span className="text-sm">Halaman {page} dari {totalPages}</span>
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50 cursor-pointer"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      {!user && <Footer />}
    </div>
  );
};

export default AllProductPage;
