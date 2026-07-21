/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    minimumCacheTTL: 31536000,
    domains: [
      'firebasestorage.googleapis.com',
      'lh3.googleusercontent.com',
      'res.cloudinary.com',
      'via.placeholder.com',
      'images.tokopedia.net'
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Allow popup-based flows (Firebase Auth, payment) to check/close windows without COOP warnings
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
};

export default nextConfig;
