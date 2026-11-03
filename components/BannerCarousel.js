import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import Image from 'next/image';

const EMPTY_BANNERS = [];

const normalizeBanners = (banners) =>
  banners
    .map((banner) => {
      if (typeof banner === 'string') return { image: banner, href: '', alt: '' };
      return {
        image: typeof banner?.image === 'string' ? banner.image : banner?.url,
        href: typeof banner?.href === 'string' ? banner.href : '',
        alt: typeof banner?.alt === 'string' ? banner.alt : '',
      };
    })
    .filter((banner) => typeof banner.image === 'string' && banner.image.trim())
    .slice(0, 5);

const BannerCarousel = ({ initialImages = EMPTY_BANNERS, fallbackToLegacy = true }) => {
  const [images, setImages] = useState(() => normalizeBanners(initialImages));
  const [loading, setLoading] = useState(initialImages.length === 0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const initialBanners = normalizeBanners(initialImages);
    if (initialBanners.length > 0) {
      setImages(initialBanners);
      setLoading(false);
      return;
    }
    if (!fallbackToLegacy) {
      setImages([]);
      setLoading(false);
      return;
    }

    const fetchBanners = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('banners').select('*');
        if (error) throw error;
        const imageList = [];
        (data || []).forEach((row) => {
          if (Array.isArray(row.images)) {
            imageList.push(...row.images.filter((image) => typeof image === 'string' && image.trim()));
          }
        });
        setImages(normalizeBanners(imageList));
      } catch (err) {
        console.error('Gagal fetch banners:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, [initialImages, fallbackToLegacy]);

  useEffect(() => {
    setCurrent((index) => (images.length ? index % images.length : 0));
  }, [images]);

  useEffect(() => {
    if (images.length < 2) return undefined;
    const intervalId = setInterval(() => {
      setCurrent((index) => (index + 1) % images.length);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [images.length]);

  const showSlide = (index) => {
    setCurrent((index + images.length) % images.length);
  };

  return (
    <div
      className="relative h-[clamp(150px,42vw,460px)] w-full overflow-hidden bg-gray-100 sm:rounded-xl"
      role="region"
      aria-label="Banner utama Purodenka"
      aria-roledescription="carousel"
    >
      {images.length > 0 ? (
        <>
          {images.map((banner, index) => {
            const image = (
              <Image
                src={banner.image}
                alt={banner.alt || `Banner utama ${index + 1} Purodenka`}
                fill
                sizes="100vw"
                className="object-cover object-center"
                priority={index === current}
              />
            );
            return (
              <div
                key={`${banner.image}-${index}`}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  index === current ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden={index !== current}
              >
                {banner.href ? (
                  <a
                    href={banner.href}
                    className="absolute inset-0 block"
                    aria-label={`Buka banner ${index + 1}`}
                    tabIndex={index === current ? 0 : -1}
                  >
                    {image}
                  </a>
                ) : image}
              </div>
            );
          })}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => showSlide(current - 1)}
                aria-label="Banner sebelumnya"
                className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white shadow transition hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => showSlide(current + 1)}
                aria-label="Banner berikutnya"
                className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl text-white shadow transition hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-white"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-black/25 px-3 py-2">
                {images.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => showSlide(index)}
                    aria-label={`Lihat banner ${index + 1}`}
                    aria-current={index === current ? 'true' : undefined}
                    className={`h-2.5 rounded-full border border-white/80 transition-all ${
                      index === current ? 'w-7 bg-white' : 'w-2.5 bg-white/60 hover:bg-white'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-sm text-gray-500">
          {loading ? 'Memuat banner...' : 'Banner belum tersedia.'}
        </div>
      )}
    </div>
  );
};

export default BannerCarousel;
