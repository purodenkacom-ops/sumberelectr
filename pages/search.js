import { useRouter } from 'next/router';
import { useEffect, useState, useMemo } from 'react';
import ProductCard from '@/components/ProductCard';
import { supabase } from '@/utils/supabase';
import { FaArrowLeft, FaSearch, FaSortAlphaDown, FaSortAmountUp, FaSortAmountDown, FaFire, FaRegClock } from 'react-icons/fa';
import PopupCart from '@/components/PopupCart';
import Fuse from 'fuse.js';
import { useDebounce } from 'use-debounce';

const SearchPage = () => {
  const router = useRouter();
  const { q } = router.query;

  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // State pencarian lokal
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch] = useDebounce(searchTerm, 300); // Jeda 300ms untuk Live Search

  // State Sorting
  const [sortBy, setSortBy] = useState('default');

  const [showCartPopup, setShowCartPopup] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Set initial search term dari query URL jika ada
  useEffect(() => {
    if (router.isReady && q && searchTerm === '') {
      setSearchTerm(q);
    }
  }, [router.isReady, q]);

  // 1. Fetch data HANYA SEKALI saat halaman dimuat (Caching)
  useEffect(() => {
    const fetchAllProducts = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) throw error;
        setAllProducts((data || []).map((product) => ({
          ...product,
          sku: product.sku || product.metadata?.sku || null,
        })));
      } catch (err) {
        console.error("Gagal mengambil data produk", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllProducts();
  }, []); // Empty dependency array = hanya jalan 1x

  // 2. Setup algoritma Fuzzy Search menggunakan Fuse.js
  const fuse = useMemo(() => {
    return new Fuse(allProducts, {
      keys: ['name', 'productName', 'description', 'category'], // Field yang dicari
      threshold: 0.4, // Toleransi typo (0 = cocok sempurna, 1 = sangat longgar)
      ignoreLocation: true,
    });
  }, [allProducts]);

  // 3. Eksekusi pencarian setiap kali text debouncedSearch berubah
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.trim() === '') {
      // Jika input kosong, tampilkan semua produk
      setFilteredProducts(allProducts);
    } else {
      const results = fuse.search(debouncedSearch);
      // Fuse.js mengembalikan data dalam format { item: {...}, refIndex: ... }
      setFilteredProducts(results.map(result => result.item));
    }
    
    // Opsional: Update URL browser agar link bisa di-copy & share tanpa merefresh halaman
    if (router.isReady && debouncedSearch && debouncedSearch !== q) {
      router.push({ pathname: '/search', query: { q: debouncedSearch } }, undefined, { shallow: true });
    }
  }, [debouncedSearch, allProducts, fuse, router.isReady]);

  // 4. Hitung sorted products berdasarkan filteredProducts dan sortBy
  const sortedProducts = useMemo(() => {
    let sorted = [...filteredProducts];
    
    // Helper function untuk mendapatkan harga minimum produk (persis seperti di ProductCard)
    const getMinPrice = (product) => {
      if (Array.isArray(product.sizeVariants) && product.sizeVariants.length > 0) {
        const prices = product.sizeVariants.flatMap(v => [Number(v.priceRetail) || 0, Number(v.priceWholesale) || 0]).filter(p => p > 0);
        return prices.length > 0 ? Math.min(...prices) : 0;
      }
      const pR = Number(product.priceRetail ?? product.price ?? 0);
      const pW = Number(product.priceWholesale ?? product.price ?? 0);
      const valid = [pR, pW].filter(p => p > 0);
      return valid.length > 0 ? Math.min(...valid) : 0;
    };

    switch (sortBy) {
      case 'az':
        sorted.sort((a, b) => (a.name || a.productName || '').localeCompare(b.name || b.productName || ''));
        break;
      case 'price_asc':
        sorted.sort((a, b) => getMinPrice(a) - getMinPrice(b));
        break;
      case 'price_desc':
        sorted.sort((a, b) => getMinPrice(b) - getMinPrice(a));
        break;
      case 'sold':
        sorted.sort((a, b) => (Number(b.sold ?? b.salesCount ?? 0)) - (Number(a.sold ?? a.salesCount ?? 0)));
        break;
      case 'newest':
        sorted.sort((a, b) => {
          const timeA = a.createdAt?.seconds || a.createdAt || 0;
          const timeB = b.createdAt?.seconds || b.createdAt || 0;
          return timeB - timeA;
        });
        break;
      default:
        break;
    }
    return sorted;
  }, [filteredProducts, sortBy]);

  const handleProductClick = (productSlug) => {
    router.push(`/product/${productSlug}`);
  };

  // Form submit dicegah reload
  const handleSearch = (e) => {
    e.preventDefault();
  };

  const handleAddToCart = (product) => {
    setSelectedProduct(product);
    setShowCartPopup(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="flex items-center bg-white shadow px-4 py-3 sticky top-0 z-20">
        <button onClick={() => router.push('/')} className="mr-3">
          <FaArrowLeft className="text-xl text-gray-700" />
        </button>
        <form
          onSubmit={handleSearch}
          className="flex-1 flex h-11 rounded-full bg-white/80 backdrop-blur border border-red-100 shadow focus-within:ring-2 focus-within:ring-orange-400/40 transition overflow-hidden"
          role="search"
          aria-label="Pencarian produk"
        >
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Ketik untuk mencari produk..."
            className="flex-1 px-4 text-sm bg-transparent outline-none placeholder:text-gray-400"
            autoFocus
          />
          <button
            type="submit"
            className="px-5 flex items-center justify-center text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 focus:outline-none"
            aria-label="Cari"
          >
            <FaSearch />
            <span className="sr-only">Cari</span>
          </button>
        </form>
      </div>

      <main className="container mx-auto px-4 py-6 min-h-screen">
        <div className="flex flex-col mb-4">
          <h2 className="text-xl font-semibold text-orange-700 mb-4">
            {debouncedSearch ? `Hasil Pencarian: "${debouncedSearch}"` : 'Semua Produk'}
          </h2>

          {/* Filter / Sort Bar (Horizontal Scroll on Mobile) */}
          {!loading && filteredProducts.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide text-sm w-full border-b border-gray-200">
              <span className="font-semibold text-gray-700 whitespace-nowrap mr-1">Urutkan:</span>
              
              <button 
                onClick={() => setSortBy('default')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors border ${sortBy === 'default' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                Default
              </button>
              
              <button 
                onClick={() => setSortBy('az')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-2 border ${sortBy === 'az' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                <FaSortAlphaDown />
                <span>A â€” Z</span>
              </button>
              
              <button 
                onClick={() => setSortBy('price_asc')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-2 border ${sortBy === 'price_asc' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                <FaSortAmountUp />
                <span>Harga Terendah</span>
              </button>
              
              <button 
                onClick={() => setSortBy('price_desc')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-2 border ${sortBy === 'price_desc' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                <FaSortAmountDown />
                <span>Harga Tertinggi</span>
              </button>
              
              <button 
                onClick={() => setSortBy('sold')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-2 border ${sortBy === 'sold' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                <FaFire />
                <span>Terlaris</span>
              </button>
              
              <button 
                onClick={() => setSortBy('newest')}
                className={`px-4 py-1.5 rounded-full whitespace-nowrap transition-colors flex items-center gap-2 border ${sortBy === 'newest' ? 'bg-red-600 text-white border-red-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-red-50'}`}
              >
                <FaRegClock />
                <span>Terbaru</span>
              </button>
              
              {/* Product Count aligned to the right (only visible easily if there is space, but valid on mobile scroll) */}
              <div className="ml-auto text-gray-500 whitespace-nowrap pl-4 text-xs font-medium">
                {sortedProducts.length} produk
              </div>
            </div>
          )}
        </div>

        {loading && <p className="text-orange-600 font-semibold">Memuat produk...</p>}
        {!loading && (
          <section>
            {sortedProducts.length === 0 ? (
              <p className="text-gray-500">Tidak ada produk yang cocok dengan pencarian Anda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {sortedProducts.map((product) => (
                  <div key={product.id} onClick={() => handleProductClick(product.productSlug)} className="cursor-pointer">
                    <ProductCard product={product} onAddToCart={handleAddToCart} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      
      <PopupCart
        show={showCartPopup}
        onClose={() => setShowCartPopup(false)}
        product={selectedProduct}
      />
    </div>
  );
};

export default SearchPage;

