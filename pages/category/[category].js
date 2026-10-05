// pages/category/[category].js
import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import ProductCard from '@/components/ProductCard';
import ProductSortBar from '@/components/ProductSortBar';
import ProductSidebar from '@/components/ProductSidebar';
import MiniNavbar from '@/components/MiniNavbar';
import ProductFilterBar from '@/components/ProductFilterBar';
import { computeAvailableFilters, applyProductFilters } from '@/utils/productFilters';
import { supabaseAdmin } from '@/utils/supabaseAdmin';

import Head from 'next/head';
import { FaChevronDown } from 'react-icons/fa';

export async function getStaticPaths() {
  try {
    const { data: categories } = await supabaseAdmin
      .from('categories')
      .select('slug')
      .is('parent_id', null);
    
    const paths = (categories || []).map(c => ({
      params: { category: c.slug }
    }));
    
    return { paths, fallback: 'blocking' };
  } catch (e) {
    console.error('[getStaticPaths] categories:', e);
    return { paths: [], fallback: 'blocking' };
  }
}

export async function getStaticProps({ params }) {
  const { category } = params;

  try {
    // Get products by category_slug
    const { data: productRows } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('category_slug', category);

    const products = (productRows || []).map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      product_slug: p.product_slug,
      category: p.category,
      categorySlug: p.category_slug,
      subCategory: p.sub_category,
      subCategorySlug: p.sub_category_slug,
      description: p.description,
      images: p.images || [],
      price: p.price,
      priceRetail: p.price_retail,
      priceWholesale: p.price_wholesale,
      minWholesale: p.min_wholesale,
      stock: p.stock,
      weight: p.weight,
      sold: p.sold,
      discount: p.discount,
      rating: p.rating,
      sizeVariants: p.size_variants || [],
      createdAt: p.created_at || null,
    }));

    // Get category data
    let categoryData = null;
    const { data: catRow } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('slug', category)
      .is('parent_id', null)
      .single();
    
    if (catRow) {
      categoryData = {
        id: catRow.id,
        name: catRow.name || null,
        slug: catRow.slug || null,
        banner: catRow.banner || null
      };
    }

    return {
      props: {
        category,
        products: JSON.parse(JSON.stringify(products)),
        categoryData,
      },
      revalidate: 86400,
    };
  } catch (error) {
    console.error('Error fetching category products:', error);
    return {
      notFound: true,
      revalidate: 86400,
    };
  }
}

export default function CategoryPage({ category, products, categoryData }) {
  const router = useRouter();
  const [sortMode, setSortMode] = useState('default');
  const [subCategoryFilter, setSubCategoryFilter] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Produk filters (hanya aktif saat sub kategori dipilih)
  const [phaseFilter, setPhaseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [kontaktorTypeFilter, setKontaktorTypeFilter] = useState('');
  const [ampereFilter, setAmpereFilter] = useState('');
  const [voltageFilter, setVoltageFilter] = useState('');
  const [displayTypeFilter, setDisplayTypeFilter] = useState('');

  // Reset semua filter saat kategori berubah
  useEffect(() => {
    setIsMobileSidebarOpen(false);
    setPhaseFilter('');
    setTypeFilter('');
    setKontaktorTypeFilter('');
    setAmpereFilter('');
    setVoltageFilter('');
    setDisplayTypeFilter('');

    // Synchronize subCategoryFilter from URL query on load / category change
    if (router.isReady) {
      setSubCategoryFilter(router.query.sub || '');
    }
  }, [category, router.query.sub, router.isReady]);

  // Reset product filters saat sub kategori berubah
  useEffect(() => {
    setPhaseFilter('');
    setTypeFilter('');
    setKontaktorTypeFilter('');
    setAmpereFilter('');
    setVoltageFilter('');
    setDisplayTypeFilter('');
  }, [subCategoryFilter]);

  const readableCategory = category.replace(/-/g, ' ');
  const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com').replace(/\/$/, '');
  const title = `Kategori ${readableCategory} | Purodenka`;
  const description = `Lihat koleksi peralatan listrik kategori ${readableCategory} di Purodenka. Temukan MCB, contactor, relay, power supply, kabel/wiring duct, saklar, dan aksesori panel dengan harga kompetitif.`;

  // Helper: get minimum price for sorting
  const getMinPrice = (p) => {
    try {
      if (Array.isArray(p.sizeVariants) && p.sizeVariants.length) {
        const values = p.sizeVariants.map(v => Number(v.priceRetail || v.priceWholesale || 0)).filter(n => n > 0);
        if (values.length) return Math.min(...values);
      }
      return Math.min(
        Number(p.priceRetail || p.price || 0) || Infinity,
        Number(p.priceWholesale || p.price || 0) || Infinity
      ) || 0;
    } catch { return 0; }
  };

  // Products filtered by subcategory
  const subCatProducts = useMemo(() => {
    if (!subCategoryFilter) return products;
    return products.filter(p =>
      (p.subCategorySlug || p.subCategory || '').toLowerCase() === subCategoryFilter.toLowerCase()
    );
  }, [products, subCategoryFilter]);

  // Compute which product filters are available
  const filterMeta = useMemo(() => {
    const productsToAnalyze = subCategoryFilter ? subCatProducts : products;
    return computeAvailableFilters(productsToAnalyze);
  }, [products, subCatProducts, subCategoryFilter]);

  // Sort and filter products client-side
  const sortedProducts = useMemo(() => {
    let out;

    if (subCategoryFilter) {
      // Apply product-level filters (phase, type, ampere, voltage, displayType)
      out = applyProductFilters(subCatProducts, { searchTerm: '', phaseFilter, typeFilter, kontaktorTypeFilter, ampereFilter, voltageFilter, displayTypeFilter });
    } else {
      // Group by subcategory when no filter is applied
      out = products.slice();
      const groups = {};
      out.forEach(p => {
        const subCat = (p.subCategorySlug || p.subCategory || 'lain-lain').toLowerCase();
        if (!groups[subCat]) {
          groups[subCat] = {
            ...p,
            _allPrices: [],
            _allSold: 0
          };
        }
        groups[subCat]._allPrices.push(getMinPrice(p));
        groups[subCat]._allSold += Number(p.sold ?? p.salesCount ?? 0);
      });

      out = Object.values(groups).map(g => {
        const validPrices = g._allPrices.filter(pr => pr > 0);
        if (validPrices.length > 0) {
          g.minPriceGroup = Math.min(...validPrices);
          g.maxPriceGroup = Math.max(...validPrices);
        } else {
          g.minPriceGroup = 0;
          g.maxPriceGroup = 0;
        }
        g.sold = g._allSold;
        delete g._allPrices;
        delete g._allSold;
        return g;
      });
    }

    switch (sortMode) {
      case 'az':
        out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id'));
        break;
      case 'price-asc':
        out.sort((a, b) => ((a.minPriceGroup ?? getMinPrice(a)) || 0) - ((b.minPriceGroup ?? getMinPrice(b)) || 0));
        break;
      case 'price-desc':
        out.sort((a, b) => ((b.minPriceGroup ?? getMinPrice(b)) || 0) - ((a.minPriceGroup ?? getMinPrice(a)) || 0));
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
        break;
    }
    return out;
  }, [products, subCatProducts, sortMode, subCategoryFilter, phaseFilter, typeFilter, kontaktorTypeFilter, ampereFilter, voltageFilter, displayTypeFilter]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
          <meta name="robots" content="index, follow" />
        <meta name="keywords" content={`kategori ${readableCategory}, peralatan listrik, mcb, contactor, power supply, kabel duct, Purodenka`} />
        <link rel="canonical" href={`${SITE_URL}/category/${category}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${SITE_URL}/category/${category}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <div className="sticky top-4 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <MiniNavbar backUrl="/" backLabel="Beranda" />
        </div>
      </div>
      <main
        className={
          typeof window !== 'undefined' && window.innerWidth < 1024
            ? "max-w-7xl mx-auto px-2 mr-[-60px] py-6 mt-4"
            : "max-w-7xl mx-auto px-4 py-6 mt-4"
        }
      >
        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 items-start">
          {/* Sidebar (Desktop) */}
          <div className="hidden lg:block lg:sticky lg:top-20">
            <ProductSidebar
              currentCategorySlug={category}
              currentSubCategorySlug={subCategoryFilter}
              onCategorySelect={(name, slug) => {
                if (slug !== category) {
                  router.push(`/category/${slug}`);
                } else {
                  setSubCategoryFilter('');
                }
              }}
              onSubCategorySelect={(name, slug, parentSlug) => {
                if (parentSlug && parentSlug !== category) {
                  router.push(`/category/${parentSlug}?sub=${slug}`);
                } else {
                  router.push(`/category/${category}?sub=${slug}`, undefined, { shallow: true });
                }
              }}
              onClearFilters={() => {
                router.push(`/category/${category}`, undefined, { shallow: true });
              }}
            />
          </div>

          {/* Sidebar Drawer (Mobile) */}
          <ProductSidebar
            isMobile
            isOpen={isMobileSidebarOpen}
            onClose={() => setIsMobileSidebarOpen(false)}
            currentCategorySlug={category}
            currentSubCategorySlug={subCategoryFilter}
            onCategorySelect={(name, slug) => {
              if (slug !== category) {
                router.push(`/category/${slug}`);
              } else {
                setSubCategoryFilter('');
              }
              setIsMobileSidebarOpen(false);
            }}
            onSubCategorySelect={(name, slug, parentSlug) => {
              if (parentSlug && parentSlug !== category) {
                router.push(`/category/${parentSlug}?sub=${slug}`);
              } else {
                router.push(`/category/${category}?sub=${slug}`, undefined, { shallow: true });
              }
              setIsMobileSidebarOpen(false);
            }}
            onClearFilters={() => {
              router.push(`/category/${category}`, undefined, { shallow: true });
              setIsMobileSidebarOpen(false);
            }}
          />

          {/* Main content */}
          <div>
            {categoryData?.banner && (
              <div className="mb-6 w-full overflow-hidden shadow-sm flex justify-center bg-gray-50 rounded-xl">
                <Image
                  src={categoryData.banner}
                  alt={categoryData.name || 'Category Banner'}
                  width={800}
                  height={200}
                  className="w-full h-auto object-cover rounded-xl"
                  priority
                />
              </div>
            )}

            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {categoryData?.name || readableCategory}
              </h1>
              <p className="text-sm text-gray-600">
                {subCategoryFilter
                  ? `Filter: ${subCategoryFilter.replace(/-/g, ' ')}`
                  : `Menampilkan semua subkategori dari ${categoryData?.name || readableCategory}`}
              </p>
            </div>

            {/* Mobile Filter Toggle Button */}
            <div className="lg:hidden mb-4">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition"
              >
                <span className="text-sm font-medium text-gray-700">Filter Kategori</span>
                <FaChevronDown className="text-gray-500" />
              </button>
            </div>

            {/* Product Filter Bar */}
            {(filterMeta.hasPhase || filterMeta.isMCCB || filterMeta.isLC1D || filterMeta.hasDisplayType) && (
              <ProductFilterBar
                hasPhase={filterMeta.hasPhase}
                isMCCB={filterMeta.isMCCB}
                isLC1D={filterMeta.isLC1D}
                hasDisplayType={filterMeta.hasDisplayType}
                availablePhases={filterMeta.availablePhases}
                availableTypes={filterMeta.availableTypes}
                availableKontaktorTypes={filterMeta.availableKontaktorTypes}
                availableAmperes={filterMeta.availableAmperes}
                availableVoltages={filterMeta.availableVoltages}
                availableDisplayTypes={filterMeta.availableDisplayTypes}
                phaseFilter={phaseFilter}
                setPhaseFilter={setPhaseFilter}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                kontaktorTypeFilter={kontaktorTypeFilter}
                setKontaktorTypeFilter={setKontaktorTypeFilter}
                ampereFilter={ampereFilter}
                setAmpereFilter={setAmpereFilter}
                voltageFilter={voltageFilter}
                setVoltageFilter={setVoltageFilter}
                displayTypeFilter={displayTypeFilter}
                setDisplayTypeFilter={setDisplayTypeFilter}
              />
            )}

            <ProductSortBar sortMode={sortMode} setSortMode={setSortMode} />

            {sortedProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Tidak ada produk ditemukan.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {sortedProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
