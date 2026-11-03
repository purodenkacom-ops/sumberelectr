import { supabaseAdmin } from '@/utils/supabaseAdmin';

const DEFAULT_SETTINGS = {
  carouselBanners: null,
  banner2: { image: '', href: '' },
  banner3: { image: '', href: '' },
  socialLinks: {
    instagram: 'https://www.instagram.com/purodenka',
    facebook: 'https://facebook.com/purodenka',
    whatsapp: '',
  },
};

const isValidUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (value.trim() === '') return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

async function requireAdmin(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') return null;
  return user;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('type', 'homepage')
      .maybeSingle();

    if (error) {
      console.error('homepage-settings read error:', error);
      return res.status(500).json({ error: 'Gagal memuat pengaturan homepage.' });
    }

    const value = data?.value && typeof data.value === 'object' ? data.value : {};
    return res.status(200).json({
      ...DEFAULT_SETTINGS,
      ...value,
      carouselBanners: Array.isArray(value.carouselBanners)
        ? value.carouselBanners.slice(0, 5).map((banner) => ({
            image: typeof banner?.image === 'string' ? banner.image : '',
            href: typeof banner?.href === 'string' ? banner.href : '',
          }))
        : null,
      banner2: { ...DEFAULT_SETTINGS.banner2, ...value.banner2 },
      banner3: { ...DEFAULT_SETTINGS.banner3, ...value.banner3 },
      socialLinks: { ...DEFAULT_SETTINGS.socialLinks, ...value.socialLinks },
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(401).json({ error: 'Unauthorized' });

    const { carouselBanners, banner2, banner3, socialLinks } = req.body || {};
    if (
      !Array.isArray(carouselBanners) ||
      carouselBanners.length > 5 ||
      !carouselBanners.every((banner) =>
        banner &&
        typeof banner === 'object' &&
        typeof banner.image === 'string' &&
        typeof banner.href === 'string'
      ) ||
      !banner2 || typeof banner2 !== 'object' ||
      !banner3 || typeof banner3 !== 'object' ||
      !socialLinks || typeof socialLinks !== 'object'
    ) {
      return res.status(400).json({ error: 'Format pengaturan homepage tidak valid.' });
    }

    const settings = {
      carouselBanners: carouselBanners.map(({ image, href }) => ({ image, href })),
      banner2: { image: banner2.image, href: banner2.href },
      banner3: { image: banner3.image, href: banner3.href },
      socialLinks: {
        instagram: socialLinks.instagram,
        facebook: socialLinks.facebook,
        whatsapp: socialLinks.whatsapp,
      },
    };
    if (
      !banner2 || !banner3 || !socialLinks ||
      !isValidUrl(banner2.image) || !isValidUrl(banner2.href) ||
      !isValidUrl(banner3.image) || !isValidUrl(banner3.href) ||
      !carouselBanners.every((banner) => isValidUrl(banner.image) && isValidUrl(banner.href)) ||
      !isValidUrl(socialLinks.instagram) ||
      !isValidUrl(socialLinks.facebook) ||
      !isValidUrl(socialLinks.whatsapp)
    ) {
      return res.status(400).json({ error: 'URL gambar atau tautan sosial tidak valid.' });
    }

    const { error } = await supabaseAdmin
      .from('settings')
      .upsert(
        { type: 'homepage', value: settings, updated_at: new Date().toISOString() },
        { onConflict: 'type' }
      );

    if (error) throw error;
    return res.status(200).json(settings);
  } catch (error) {
    console.error('homepage-settings save error:', error);
    return res.status(500).json({ error: 'Gagal menyimpan pengaturan homepage.' });
  }
}
