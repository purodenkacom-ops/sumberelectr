import React from 'react';

const VisitOurFarm = ({ info }) => {
  const {
    storeName = 'Purodenka',
    contactName = '',
    phone = '',
    email = '',
    address = '',
    postal = '',
    lat = null,
    lng = null
  } = info || {};

  const hasCoords = lat && lng;
  const mapEmbed = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}&hl=id&z=16&output=embed`
    : null;
  const mapLink = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : '#';

  return (
    <section
      className="
        bg-white rounded-xl shadow-md border border-red-100
        p-4 sm:p-5 lg:p-8          /* mobile padding diperkecil */
        mb-6 lg:mb-10              /* mobile spacing bawah diperkecil */
        -mt-1 sm:mt-0              /* sedikit tarik ke atas di mobile supaya lebih rapat */
      "
    >
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Info */}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-red-700 mb-2">
            Kunjungi Showroom / Gudang Kami
          </h2>
          <p className="text-sm text-gray-600 mb-5 lg:mb-6">
            Kunjungi showroom dan gudang {storeName}. Lihat langsung koleksi peralatan listrik, panel dan aksesorinya, serta konsultasi kebutuhan proyek Anda.
          </p>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-gray-800">{storeName}</span>
            </div>
            {contactName && (
              <div>
                <span className="block text-gray-500 uppercase tracking-wide text-[11px] font-semibold">
                  Kontak
                </span>
                <span className="font-medium text-gray-800">{contactName}</span>
              </div>
            )}
            {address && (
              <div>
                <span className="block text-gray-500 uppercase tracking-wide text-[11px] font-semibold">
                  Alamat
                </span>
                <span className="font-medium text-gray-800">
                  {address}{postal ? `, ${postal}` : ''}
                </span>
              </div>
            )}
            {(phone || email) && (
              <div className="flex flex-col gap-1">
                {phone && (
                  <a
                    href={`https://wa.me/${phone.replace(/[^0-9]/g,'')}`}
                    target="_blank"
                    rel="noopener"
                    className="text-orange-600 hover:underline font-medium w-fit"
                  >
                    Telp/WA: {phone}
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="text-orange-600 hover:underline font-medium w-fit"
                  >
                    Email: {email}
                  </a>
                )}
              </div>
            )}
          </div>
          {hasCoords && (
            <div className="mt-5 lg:mt-6">
              <a
                href={mapLink}
                target="_blank"
                rel="noopener"
                className="inline-block px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition"
              >
                Buka di Google Maps
              </a>
            </div>
          )}
        </div>
        {/* Map */}
        <div className="flex-1 min-h-[240px] sm:min-h-[260px] lg:min-h-[320px]">
          {hasCoords ? (
            <div className="w-full h-full rounded-xl overflow-hidden shadow-inner ring-1 ring-red-100">
              <iframe
                src={mapEmbed}
                title="Lokasi Purodenka"
                loading="lazy"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="w-full h-full rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
              Koordinat belum dikonfigurasi.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default VisitOurFarm;