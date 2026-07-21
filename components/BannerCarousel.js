import { useEffect, useState, useRef } from "react";
import { db } from "@/utils/firebase";
import { collection, getDocs } from "firebase/firestore";
import Image from "next/image";

const BannerCarousel = () => {
  const [images, setImages] = useState([]);
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "banners"));
        const imgArr = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.images && Array.isArray(data.images)) {
            // Filter out empty or invalid image strings before setting state
            const valid = data.images.filter((img) => typeof img === "string" && img.trim().length > 0);
            imgArr.push(...valid);
          }
        });
        setImages(imgArr);
      } catch (err) {
        console.error("Gagal fetch banners:", err);
      }
    };
    fetchBanners();
  }, []);

  useEffect(() => {
    if (images.length) {
      intervalRef.current = setInterval(() => {
        setCurrent((prev) => (prev + 1) % images.length);
      }, 4000);
      return () => clearInterval(intervalRef.current);
    }
  }, [images]);

  const goToSlide = (idx) => setCurrent(idx);

  return (
    <div
      className="
        relative w-full
        flex justify-center items-center
        overflow-hidden
        rounded-none md:rounded-xl
        h-[180px]
        sm:h-[200px]
        md:h-[260px]
        lg:h-[320px]
        xl:h-[360px]
        z-10
        mt-0
      "
    >
      {images.length > 0 ? (
        images.map((img, idx) => (
          <Image
            key={idx}
            src={img}
            alt={`banner-${idx}`}
            fill
            sizes="100vw"
            className={`absolute inset-0 w-full h-full object-cover object-center
              transition-opacity duration-700
              ${idx === current ? "opacity-100" : "opacity-0"}
            `}
            priority={idx === current}
          />
        ))
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
          Memuat banner...
        </div>
      )}

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {images.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            aria-label={`Slide ${idx + 1}`}
            className={`
              w-2.5 h-2.5 rounded-full transition
              ${idx === current ? "bg-orange-600 scale-110 shadow" : "bg-white/70 hover:bg-white"}
              border border-white/60
            `}
          />
        ))}
      </div>

      {/* Optional subtle gradient at bottom for text overlay readiness */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10" />
    </div>
  );
};

export default BannerCarousel;