import React, { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import MiniNavbar from '@/components/MiniNavbar';
import ProductCard from '@/components/ProductCard';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { firestore } from '@/utils/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

const AllProductPage = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceSort, setPriceSort] = useState('none');
  const [promoOnly, setPromoOnly] = useState(false);
  const [page, setPage] = useState(1);
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

  const filtered = useMemo(() => {
    let out = products.slice();
    if (categoryFilter) {
      out = out.filter(p => (p.category || '').toLowerCase() === String(categoryFilter).toLowerCase());
    }
    if (promoOnly) {
      out = out.filter(p => Number(p.discount) > 0).sort((a,b) => (Number(b.discount)||0) - (Number(a.discount)||0));
    }
    if (priceSort !== 'none') {
      out = out.sort((a,b) => {
        const pa = getMinPrice(a) || 0;
        const pb = getMinPrice(b) || 0;
        return priceSort === 'asc' ? pa - pb : pb - pa;
      });
    }
    return out;
  }, [products, categoryFilter, priceSort, promoOnly]);

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
        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl font-bold text-red-700">Semua Produk</h1>

          <div className="w-full md:w-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 w-full">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-white w-full sm:w-auto min-w-0"
              >
                <option value="">Semua Kategori</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <select
                value={priceSort}
                onChange={e => setPriceSort(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-white w-full sm:w-auto min-w-0"
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

        <div className="mb-4 text-sm text-gray-600">
          Menampilkan {pagedProducts.length} dari {filtered.length} produk
        </div>

        {loading ? (
          <div className="text-gray-500">Memuat produk...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500">Tidak ada produk sesuai filter.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
      </main>
      {!user && <Footer />}
    </div>
  );
};

export default AllProductPage;
