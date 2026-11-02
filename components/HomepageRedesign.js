import { useEffect, useState } from 'react';
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar variant="marketplace" socialLinks={homepageSettings?.socialLinks} />

      <main className="mx-auto max-w-7xl px-0 pb-8 pt-4 sm:px-4">
        <section aria-label="Banner utama" className="overflow-hidden bg-white lg:rounded-sm">
          <BannerCarousel initialImages={bannerMeta} />
        </section>

        <section className="mt-4">
          <CategorySection />
        </section>

        <section
          aria-label="Hubungi customer service"
          className="mt-4"
        >
          <div className="flex min-h-[96px] items-center justify-between gap-3 overflow-hidden rounded-sm bg-gradient-to-r from-red-900 via-red-800 to-red-700 px-4 py-3 text-white shadow-sm sm:min-h-[112px] sm:px-8 lg:hidden">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-100 sm:text-xs">
                Butuh bantuan?
              </p>
              <h2 className="mt-1 text-sm font-extrabold sm:text-xl">
                Konsultasi kebutuhan listrik Anda
              </h2>
              <p className="mt-1 text-[10px] text-red-100 sm:text-sm">
                Customer Service Purodenka siap membantu memilih produk yang tepat.
              </p>
            </div>
            <button
              type="button"
              onClick={contactCustomerService}
              aria-label="Hubungi Customer Service melalui WhatsApp"
              className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-[#25D366] text-white shadow-sm transition hover:bg-[#20bd5a] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-red-800 sm:h-16 sm:w-16"
            >
              <FaWhatsapp className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true" />
              <span className="text-[8px] font-bold sm:text-[9px]">CHAT CS</span>
            </button>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.55fr)] items-stretch gap-3 lg:grid">
            {[homepageSettings?.banner2, homepageSettings?.banner3].map((banner, index) => {
              const content = banner?.image ? (
                <Image
                  src={banner.image}
                  alt={`Banner promosi ${index + 2} Purodenka`}
                  fill
                  sizes="(max-width: 1280px) 32vw, 420px"
                  className="object-cover"
                />
              ) : (
                <div className={`flex h-full min-h-[124px] items-center px-6 py-4 text-white shadow-sm ${
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
                <div key={`promo-banner-${index + 2}`} className="relative h-full min-h-[124px] overflow-hidden rounded-sm">
                  {banner?.href ? (
                    <a href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={`Buka banner promosi ${index + 2}`} className="absolute inset-0 block h-full">
                      {content}
                    </a>
                  ) : (
                    <div className="h-full">{content}</div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={contactCustomerService}
              aria-label="Hubungi Customer Service melalui WhatsApp"
              className="flex h-full min-h-[124px] flex-col items-center justify-center gap-2 rounded-sm bg-[#25D366] text-white shadow-sm transition hover:bg-[#20bd5a] focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2"
            >
              <FaWhatsapp className="h-12 w-12" aria-hidden="true" />
              <span className="text-xs font-bold">CHAT CUSTOMER SERVICE</span>
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
        className="fixed right-3 top-44 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-800 bg-white p-1.5 shadow-lg transition hover:scale-105 sm:right-5 sm:top-32 sm:h-14 sm:w-14 sm:p-1.5"
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
