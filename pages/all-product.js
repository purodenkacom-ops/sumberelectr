import React, { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import MiniNavbar from '@/components/MiniNavbar';
import ProductCard from '@/components/ProductCard';
import ProductSortBar from '@/components/ProductSortBar';
import ProductSidebar from '@/components/ProductSidebar';
import Footer from '@/components/Footer';
import { FaChevronDown } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';
import { firestore } from '@/utils/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

const AllProductPage = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [priceSort, setPriceSort] = useState('none');
  const [promoOnly, setPromoOnly] = useState(false);
  const [sortMode, setSortMode] = useState('default');
  const [page, setPage] = useState(1);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [pageSize, setPageSize] = useState(16); // default desktop

  useEffect(() => {
    // Set pageSize by device
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setPageSize(window.innerWidth < 1024 ? 6 : 15);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // categories
        try {
          const catsSnap = await getDocs(query(collection(firestore, 'categories'), orderBy('createdAt', 'desc')));
          const cats = [];
          catsSnap.forEach(d => cats.push({ id: d.id, ...(d.data() || {}) }));
          setCategories(cats);
        } catch (e) {
          setCategories([]);
        }

        // products
        const prodSnap = await getDocs(collection(firestore, 'products'));
        const list = prodSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
        setProducts(list);
      } catch (err) {
        console.error('Failed to load products', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getMinPrice = (p) => {
    try {
      if (Array.isArray(p.sizeVariants) && p.sizeVariants.length) {
        const values = p.sizeVariants.map(v => Number(v.priceRetail || v.priceWholesale || 0)).filter(n => n > 0);
        if (values.length) return Math.min(...values);
      }
      return Math.min(Number(p.priceRetail || p.price || 0) || Infinity, Number(p.priceWholesale || p.price || 0) || Infinity) || 0;
    } catch { return 0; }
  };

  // Sync sortMode with priceSort for mobile dropdown compatibility
  const handleSortModeChange = (mode) => {
    setSortMode(mode);
    // Sync the mobile dropdown
    if (mode === 'price-asc') setPriceSort('asc');
    else if (mode === 'price-desc') setPriceSort('desc');
    else setPriceSort('none');
    setPage(1);
  };

  const handlePriceSortChange = (val) => {
    setPriceSort(val);
    // Sync the desktop sort bar
    if (val === 'asc') setSortMode('price-asc');
    else if (val === 'desc') setSortMode('price-desc');
    else setSortMode('default');
    setPage(1);
  };

  // Get active category slug for the sidebar
  const activeCategory = useMemo(() => {
    return categories.find(c => c.name === categoryFilter && !c.parentId);
  }, [categories, categoryFilter]);

  const activeCategorySlug = activeCategory?.slug || '';

  // Get active subcategory slug for the sidebar
  const activeSubCategory = useMemo(() => {
    if (!activeCategory) return null;
    return categories.find(c => c.name === subCategoryFilter && c.parentId === activeCategory.id);
  }, [categories, subCategoryFilter, activeCategory]);

  const activeSubCategorySlug = activeSubCategory?.slug || '';

  const filtered = useMemo(() => {
    let out = products.slice();
    if (categoryFilter) {
      out = out.filter(p => (p.category || '').toLowerCase() === String(categoryFilter).toLowerCase());
    }
    if (subCategoryFilter) {
      out = out.filter(p => (p.subCategory || '').toLowerCase() === String(subCategoryFilter).toLowerCase());
    }
    if (promoOnly) {
      out = out.filter(p => Number(p.discount) > 0).sort((a,b) => (Number(b.discount)||0) - (Number(a.discount)||0));
    }

    // Apply sort based on sortMode (desktop) or priceSort (mobile)
    const effectiveSort = sortMode;

    switch (effectiveSort) {
      case 'az':
        out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
        break;
      case 'price-asc':
        out.sort((a, b) => (getMinPrice(a) || 0) - (getMinPrice(b) || 0));
        break;
      case 'price-desc':
        out.sort((a, b) => (getMinPrice(b) || 0) - (getMinPrice(a) || 0));
        break;
      case 'best-selling':
        out.sort((a, b) => (Number(b.sold ?? b.salesCount ?? 0)) - (Number(a.sold ?? a.salesCount ?? 0)));
        break;
      case 'newest':
        out.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
      default:
        // Default sort: kategori → sub kategori → nama produk (abjad)
        out.sort((a, b) => {
          const catA = (a.category || '').toLowerCase();
          const catB = (b.category || '').toLowerCase();
          if (catA !== catB) return catA.localeCompare(catB, 'id');
          const subA = (a.subCategory || '').toLowerCase();
          const subB = (b.subCategory || '').toLowerCase();
          if (subA !== subB) return subA.localeCompare(subB, 'id');
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB, 'id');
        });
        break;
    }
    return out;
  }, [products, categoryFilter, subCategoryFilter, priceSort, promoOnly, sortMode]);

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedProducts = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ItemList schema for SEO
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": filtered.map((p, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "url": `/product/${p.productSlug || p.slug || p.id}`,
      "name": p.name,
      "image": p.image || (Array.isArray(p.images) ? p.images[0] : undefined) || '',
      "offers": {
        "@type": "Offer",
        "price": getMinPrice(p),
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
          {/* Sidebar */}
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

          {/* Sidebar Drawer (Mobile) */}
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

          {/* Main content */}
          <div>
            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h1 className="text-2xl font-bold text-red-700">Semua Produk</h1>

              <div className="w-full md:w-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 w-full">
                  {/* Category Filter Trigger for Mobile */}
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
                    <input type="checkbox" checked={promoOnly} onChange={e => setPromoOnly(e.target.checked)} className="form-checkbox h-4 w-4 text-orange-600" />
                    <span className="text-sm">Promo</span>
                  </label>
                </div>
              </div>
            </div>

            <ProductSortBar
              activeSort={sortMode}
              onSortChange={handleSortModeChange}
              totalCount={filtered.length}
            />

            {/* Filter tags (visual cue for selected subcategory) */}
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
              Menampilkan {pagedProducts.length} dari {filtered.length} produk
            </div>

            {loading ? (
              <div className="text-gray-500">Memuat produk...</div>
            ) : filtered.length === 0 ? (
              <div className="text-gray-500">Tidak ada produk sesuai filter.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {pagedProducts.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                <div className="flex justify-center items-center gap-4 mt-6">
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Prev
                  </button>
                  <span className="text-sm">Halaman {page} dari {totalPages}</span>
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
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
