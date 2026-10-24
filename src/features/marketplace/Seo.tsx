import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { marketplaceClient } from './api'

const origin = 'https://car.swahivo.com'
const pages: Record<string, [string, string]> = {
  '/': [
    'Swahivo | Buy, Sell & Rent Cars in East Africa',
    'Discover cars for sale and rent, compare providers, and grow your automotive business with Swahivo. East Africa based Zanzibar, Tanzania.',
  ],
  '/cars': [
    'Cars for Sale | Swahivo',
    'Browse new and used cars from approved Swahivo dealerships. Compare vehicles and contact sellers. East Africa based Zanzibar, Tanzania.',
  ],
  '/rentals': [
    'Car Hire & Rental Vehicles | Swahivo',
    'Find rental vehicles, search availability for your dates and request a booking with a Swahivo provider. East Africa based Zanzibar, Tanzania.',
  ],
  '/pricing': [
    'Business Plans | Swahivo',
    'Explore Swahivo plans for dealerships and rental businesses, listing allowances and advertising options.',
  ],
  '/register': [
    'Create Your Account | Swahivo',
    'Join Swahivo as a buyer or register your automotive business and select the services you offer.',
  ],
}
export function Seo() {
  const { pathname, search } = useLocation()
  const detail = /^\/(cars|rentals)\/([^/]+)$/.exec(pathname)
  const offer = useQuery({
    queryKey: ['swahivo', 'seo', detail?.[2]],
    enabled: !!detail,
    queryFn: async () => {
      const result = await marketplaceClient()
        .from('marketplace_catalogue')
        .select('*')
        .eq('slug', detail![2]!)
        .maybeSingle()
      if (result.error) throw result.error
      return result.data
    },
  })
  useEffect(() => {
    const page = pages[pathname],
      listing = offer.data
    const publicPage = !!page || (!!detail && !!listing) || /^\/providers\/[^/]+$/.test(pathname)
    const title =
      listing && detail
        ? `${listing.title} | Swahivo`
        : (page?.[0] ?? 'Swahivo Automotive Marketplace')
    const description =
      listing && detail
        ? `${listing.title}. ${listing.business_name}. View vehicle details and contact the provider on Swahivo.`
        : (page?.[1] ??
          'Swahivo automotive marketplace and business platform. East Africa based Zanzibar, Tanzania.')
    document.title = title
    const meta = (key: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name'
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.append(el)
      }
      el.content = content
    }
    meta('description', description)
    meta('robots', publicPage && !search ? 'index, follow' : 'noindex, follow')
    meta('og:title', title, true)
    meta('og:description', description, true)
    meta('og:url', origin + pathname, true)
    meta('og:image', origin + '/swahivo/logo.png', true)
    meta('twitter:card', 'summary')
    meta('twitter:title', title)
    meta('twitter:description', description)
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.append(canonical)
    }
    canonical.href = origin + pathname
    let schema = document.getElementById('swahivo-schema')
    if (!schema) {
      schema = document.createElement('script')
      schema.id = 'swahivo-schema'
      schema.setAttribute('type', 'application/ld+json')
      document.head.append(schema)
    }
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Swahivo',
      url: origin,
      logo: origin + '/swahivo/logo.png',
      description: 'Automotive marketplace. East Africa based Zanzibar, Tanzania.',
    })
  }, [pathname, search, offer.data, detail?.[2]])
  return null
}
