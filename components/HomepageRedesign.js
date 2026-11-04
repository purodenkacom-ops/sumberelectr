import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import BannerCarousel from '@/components/BannerCarousel';
import CategorySection from '@/components/CategorySection';
import FavoriteFishSection from '@/components/FavoriteFishSection';
import AdsImage from '@/components/adsimage';
import Recomend from '@/components/Recomend';
import HomeArticles from '@/components/HomeArticles';
import VisitOurFarm from '@/components/VisitOurFarm';
import { FaWhatsapp } from 'react-icons/fa';

export default function HomepageRedesign({
  favoriteFish = [],
  recommendations = [],
  bannerMeta = [],
  homepageSettings: initialHomepageSettings,
  farmInfo,
  articles = [],
}) {
  const { user } = useAuth();
  const accountHref = user ? '/account' : '/login';
  const [homepageSettings, setHomepageSettings] = useState(initialHomepageSettings);
  const carouselConfigured = Array.isArray(homepageSettings?.carouselBanners);
  const carouselImages = useMemo(
    () => carouselConfigured
      ? homepageSettings.carouselBanners.filter((banner) => banner?.image)
      : bannerMeta,
    [bannerMeta, carouselConfigured, homepageSettings?.carouselBanners]
  );

  useEffect(() => {
    let active = true;
    fetch('/api/homepage-settings')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Gagal memuat pengaturan homepage.');
        if (active) setHomepageSettings(data);
      })
      .catch((error) => console.error('Gagal memuat pengaturan homepage:', error));

    return () => {
      active = false;
    };
  }, []);

  const contactCustomerService = async () => {
    const popup = window.open('', '_blank');
    let number = process.env.NEXT_PUBLIC_ADMIN_WA || '6281234567890';

    try {
      const response = await fetch('/api/whatsapp/next');
      const data = await response.json();
      if (data?.number) number = data.number;
    } catch (error) {
      console.error('Gagal mendapatkan nomor WhatsApp CS:', error);
    }

    const message = 'Halo Customer Service Purodenka, saya ingin bertanya tentang produk.';
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  };

  const renderPromoBanner = (banner, index, heightClass) => {
    const content = banner?.image ? (
      <Image
        src={banner.image}
        alt={`Banner promosi ${index + 2} Purodenka`}
        fill
        sizes="(max-width: 1023px) 100vw, (max-width: 1280px) 42vw, 560px"
        className="bg-gray-100 object-contain"
      />
    ) : (
      <div className={`flex h-full min-h-full items-center px-6 py-4 text-white shadow-sm ${
        index === 0
          ? 'bg-gradient-to-r from-red-900 via-red-800 to-red-700'
          : 'bg-gradient-to-r from-red-700 via-red-600 to-red-700'
      }`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-100">
            {index === 0 ? 'Butuh bantuan?' : 'Belanja lebih tenang'}
          </p>
          <h2 className="mt-1 text-xl font-extrabold">
            {index === 0 ? 'Konsultasi kebutuhan listrik Anda' : 'Produk asli & bergaransi'}
          </h2>
          <p className="mt-1 text-sm text-red-100">
            {index === 0
              ? 'Customer Service Purodenka siap membantu memilih produk yang tepat.'
              : 'Pilihan komponen listrik untuk kebutuhan rumah dan industri.'}
          </p>
        </div>
      </div>
    );

    return (
      <div className={`relative ${heightClass} overflow-hidden rounded-sm`}>
        {banner?.href ? (
          <a href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={`Buka banner promosi ${index + 2}`} className="absolute inset-0 block h-full">
            {content}
          </a>
        ) : (
          <div className="h-full">{content}</div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="marketplace" socialLinks={homepageSettings?.socialLinks} />

      <main className="mx-auto max-w-7xl px-0 pb-8 pt-4 sm:px-4">
        <section aria-label="Banner utama" className="overflow-hidden bg-white lg:rounded-sm">
          <BannerCarousel initialImages={carouselImages} fallbackToLegacy={!carouselConfigured} />
        </section>

        <section className="mt-4">
          <CategorySection />
        </section>

        <section
          aria-label="Hubungi customer service"
          className="mt-4"
        >
          <div className="lg:hidden">
            {renderPromoBanner(homepageSettings?.banner2, 0, 'h-[180px] sm:h-[220px]')}
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] items-stretch gap-3 lg:grid">
            {[homepageSettings?.banner2, homepageSettings?.banner3].map((banner, index) => {
              return (
                <div key={`promo-banner-${index + 2}`}>
                  {renderPromoBanner(banner, index, 'h-[200px]')}
                </div>
              );
            })}
            <button
              type="button"
              onClick={contactCustomerService}
              aria-label="Hubungi Customer Service melalui WhatsApp"
              className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 justify-self-center self-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:bg-[#20bd5a] focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2"
            >
              <FaWhatsapp className="h-10 w-10" aria-hidden="true" />
              <span className="text-[8px] font-bold">CHAT CS</span>
            </button>
          </div>
        </section>

        <section id="produk-terlaris" className="mt-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
            <FavoriteFishSection products={favoriteFish} />
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-red-800">
                Pilihan untuk Anda
              </h2>
              <AdsImage className="overflow-hidden rounded-md" desktopStacked />
            </div>
          </div>
        </section>

        <div className="mt-4 min-w-0">
          <Recomend items={recommendations} />
          <HomeArticles articles={articles} />
          <VisitOurFarm info={farmInfo} />
        </div>
      </main>

      <Link
        href={accountHref}
        aria-label={user ? 'Buka akun saya' : 'Log in'}
        title={user ? 'Akun Saya' : 'Log In'}
        className="fixed right-3 top-[208px] z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-800 bg-white p-1.5 shadow-lg transition hover:scale-105 sm:right-5 sm:top-[160px] sm:h-14 sm:w-14 sm:p-1.5"
      >
        <Image
          src="/purodenka-logo.png"
          alt=""
          aria-hidden="true"
          width={52}
          height={52}
          className="h-full w-full object-contain"
        />
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-red-800">
          {user ? 'Akun Saya' : 'Log In'}
        </span>
      </Link>
    </div>
  );
}
