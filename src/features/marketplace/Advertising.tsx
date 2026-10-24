import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { marketplaceClient, rpc, type Advertisement } from './api'

function visitorId() {
  try {
    let id = sessionStorage.getItem('swahivo.ad-visitor')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('swahivo.ad-visitor', id)
    }
    return id
  } catch {
    return null
  }
}
function track(id: string, kind: 'impression' | 'click') {
  const visitor = visitorId()
  if (visitor)
    void rpc('marketplace_ad_event', { p_id: id, p_kind: kind, p_visitor: visitor }).catch(
      () => undefined,
    )
}
function SponsoredCard({ ad }: { ad: Advertisement }) {
  const element = useRef<HTMLElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track(ad.id, 'impression')
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [ad.id])
  return (
    <article ref={element} className="sw-ad-card">
      <Link to={ad.destination} onClick={() => track(ad.id, 'click')} rel="sponsored">
        {ad.image_url && (
          <img src={ad.image_url} alt={ad.title} loading="lazy" width="640" height="300" />
        )}
        <div>
          <span className="sw-status">Sponsored</span>
          <h3>{ad.title}</h3>
          <p>{ad.description}</p>
          <strong>{ad.business_name} →</strong>
        </div>
      </Link>
    </article>
  )
}
export function AdSlot({ placement }: { placement: string }) {
  const query = useQuery({
    queryKey: ['swahivo', 'ad-feed', placement],
    staleTime: 60000,
    queryFn: async () => {
      const ads = await rpc<Advertisement[]>('marketplace_ad_feed', { p_placement: placement })
      return Promise.all(
        ads.map(async (ad) => {
          if (!ad.display_image) return ad
          const r = await marketplaceClient()
            .storage.from(ad.image_bucket)
            .createSignedUrl(ad.display_image, 3600)
          return { ...ad, image_url: r.data?.signedUrl }
        }),
      )
    },
  })
  if (!query.data?.length) return null
  return (
    <section className="sw-ad-slot" aria-label="Sponsored providers">
      <div className="sw-section-head">
        <h2>Featured partners</h2>
        <Link className="sw-link" to="/dashboard">
          Advertise with Swahivo →
        </Link>
      </div>
      <div className="sw-ad-grid">
        {query.data.map((ad) => (
          <SponsoredCard key={ad.id} ad={ad} />
        ))}
      </div>
    </section>
  )
}
