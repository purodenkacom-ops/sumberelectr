const siteUrlBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.purodenka.com';
const siteUrl = siteUrlBase.endsWith('/') ? siteUrlBase : `${siteUrlBase}/`;

export default {
  titleTemplate: '%s',
  defaultTitle: 'Purodenka | Toko Peralatan Listrik & Elektronik Industri • Harga Kompetitif, Barang Asli',
  description: 'Purodenka adalah toko peralatan listrik dan elektronik industri terpercaya di Indonesia. Tersedia MCB/MCCB, contactor, relay, power supply, rotary switch, sensor, kabel/wiring duct, din rail, aksesori panel listrik, dan banyak lagi. Barang asli bergaransi, harga kompetitif, siap kirim ke seluruh Indonesia.',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: siteUrl,
    site_name: 'Purodenka'
  },
  twitter: {
    handle: '@purodenka',
    site: '@purodenka',
    cardType: 'summary_large_image'
  },
  additionalMetaTags: [
    { name: 'keywords', content: 'toko peralatan listrik, elektronik industri, mcb, mccb, contactor, relay, power supply, smps, kabel duct, wiring duct, rotary switch, buzzer panel, din rail, panel listrik, aksesoris panel, sensor, saklar, schneider, omron, hanyoung, salzer' },
    { name: 'robots', content: 'index,follow' },
    { name: 'google-site-verification', content: 'sCD2fkfPQyg4YA2TK0OknPrlVqiV1U4m1crkL8gVMis' }
  ],
  additionalLinkTags: [
    { rel: 'canonical', href: siteUrl }
  ]
};
