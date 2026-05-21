// pages/category/[category].js
import { useState, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestore } from '@/utils/firebase';
import ProductCard from '@/components/ProductCard';
import ProductSortBar from '@/components/ProductSortBar';
import MiniNavbar from '@/components/MiniNavbar';
import Footer from '@/components/Footer';
import Head from 'next/head';

export async function getServerSideProps(context) {
  const { category } = context.params;

  try {
    const q = query(collection(firestore, 'products'), where('categorySlug', '==', category));
    const querySnapshot = await getDocs(q);
    const products = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Pastikan semua field serializable
        createdAt: data.createdAt?.toDate?.().toISOString?.() || null,
      };
    });

    return {
      props: {
        category,
        products,
      },
    };
  } catch (error) {
    console.error('Error fetching category products:', error);
    return {
      notFound: true,
    };
  }
}

export default function CategoryPage({ category, products }) {
  const [sortMode, setSortMode] = useState('default');

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

  // Sort products client-side
  const sortedProducts = useMemo(() => {
    let out = products.slice();

    switch (sortMode) {
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
        // Default: keep original order from Firestore
        break;
    }
    return out;
  }, [products, sortMode]);

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
        <h1 className="text-2xl font-bold text-red-700 mb-6">
          {readableCategory}
        </h1>

        <ProductSortBar
          activeSort={sortMode}
          onSortChange={(mode) => setSortMode(mode)}
          totalCount={sortedProducts.length}
        />

        {sortedProducts.length === 0 ? (
          <p className="text-center text-lg text-gray-600">
            Tidak ada produk untuk kategori &quot;{readableCategory}&quot;
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sortedProducts.map((product) => (
              <div key={product.id} className="block hover:bg-red-50 rounded-lg transition">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
