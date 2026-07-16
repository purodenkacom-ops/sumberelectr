import '../styles/globals.css'
import { AuthProvider } from '../context/AuthContext'
import { DiscountProvider } from '@/context/DiscountContext'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { DefaultSeo } from 'next-seo'
import SEO from '../next-seo.config'


function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <DiscountProvider>
        <DefaultSeo defer={false} {...SEO} />
        <Component {...pageProps} />
        <Analytics />
        <SpeedInsights />
      </DiscountProvider>
    </AuthProvider>
  )
}

export default MyApp
