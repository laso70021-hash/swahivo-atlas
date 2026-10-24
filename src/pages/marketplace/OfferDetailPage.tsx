import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CarFront,
  MapPin,
  ShieldCheck,
  MessageCircle,
  Phone,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Fuel,
  Gauge,
  Settings2,
} from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import {
  marketplaceClient,
  withPhotos,
  whatsappUrl,
  money,
  rpc,
  type ServiceType,
  type Offer,
} from '@/features/marketplace/api'
import { PublicHeader, PublicFooter, EmptyMarketplace, OfferCard } from './MarketplacePage'

export function OfferDetailPage({ service }: { service: ServiceType }) {
  const { slug } = useParams()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [from, setFrom] = useState(params.get('from') ?? '')
  const [to, setTo] = useState(params.get('to') ?? '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['swahivo', 'offer', service, slug],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_catalogue')
        .select('*')
        .eq('slug', slug!)
        .eq('service', service)
        .maybeSingle()
      if (r.error) throw r.error
      return r.data ? (await withPhotos([r.data]))[0] : null
    },
  })
  const offer = query.data
  const rental = service === 'rental'
  const whatsapp = offer ? whatsappUrl(offer, from, to) : null
  async function enquiry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const data = new FormData(e.currentTarget)
      await rpc('marketplace_send_enquiry', {
        p_offer_id: offer!.id,
        p_message: fieldText(data.get('message')),
      })
      setMessage('Your enquiry was saved and is available to this provider.')
      form.reset()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not send enquiry.')
    } finally {
      setBusy(false)
    }
  }
  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const data = new FormData(e.currentTarget)
      await rpc('marketplace_request_booking', {
        p_offer_id: offer!.id,
        p_from: new Date(from).toISOString(),
        p_to: new Date(to).toISOString(),
        p_pickup: fieldText(data.get('pickup')),
        p_return: fieldText(data.get('return')),
        p_driver_name: fieldText(data.get('driver')),
        p_accept_terms: data.get('terms') === 'on',
      })
      setMessage(
        'Your booking request was saved. The agency must confirm availability before it becomes a reservation.',
      )
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not request booking.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sw-page">
      <PublicHeader />
      <div className="sw-container">
        <Link className="sw-link" to={rental ? '/rentals' : '/cars'}>
          <ArrowLeft size={14} /> Back to {rental ? 'rentals' : 'cars'}
        </Link>
        {query.isPending ? (
          <EmptyMarketplace title="Loading vehicle">
            Fetching the published listing…
          </EmptyMarketplace>
        ) : query.error ? (
          <EmptyMarketplace title="Could not load this vehicle">
            {query.error.message}
          </EmptyMarketplace>
        ) : !offer ? (
          <EmptyMarketplace title="Listing unavailable">
            This vehicle may have been sold, archived, or removed by its provider.
          </EmptyMarketplace>
        ) : (
          <>
            <div className="sw-detail">
              <div>
                <div className="sw-detail-photo">
                  {offer.image_urls?.[0] ? (
                    <img src={offer.image_urls[0]} alt={offer.title} />
                  ) : (
                    <CarFront size={90} color="#9aaec6" />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12, overflowX: 'auto' }}>
                  {offer.image_urls?.slice(1).map((image, i) => (
                    <img
                      key={i}
                      src={image}
                      alt={`${offer.title} detail ${i + 1}`}
                      style={{ width: 130, height: 90, objectFit: 'cover', borderRadius: 7 }}
                    />
                  ))}
                </div>
                <section className="sw-panel" style={{ marginTop: 22 }}>
                  <h2>About this vehicle</h2>
                  <p
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      lineHeight: 1.8,
                      color: '#64758e',
                    }}
                  >
                    {offer.description ||
                      'Contact the provider for more information about this vehicle.'}
                  </p>
                </section>
              </div>
              <div>
                <span className="sw-status">
                  {rental
                    ? 'Rental vehicle'
                    : offer.condition === 'new'
                      ? 'New vehicle'
                      : 'Pre-owned vehicle'}
                </span>
                <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 16 }}>{offer.title}</h1>
                <p className="sw-card-location" style={{ fontSize: 13 }}>
                  <MapPin size={15} />
                  {offer.location}
                </p>
                <div className="sw-price" style={{ fontSize: 30, marginBlock: 22 }}>
                  {money(offer.price_minor, offer.currency)}
                  {rental && <small> / day</small>}
                </div>
                <div
                  className="sw-card-specs"
                  style={{
                    fontSize: 13,
                    gap: 16,
                    paddingBlock: 20,
                    borderBlock: '1px solid #e0e7f0',
                  }}
                >
                  {[
                    [CalendarDays, String(offer.model_year)],
                    [Gauge, `${offer.mileage.toLocaleString()} km`],
                    [Fuel, offer.fuel_type],
                    [Settings2, offer.transmission],
                  ].map(([Icon, value]) => {
                    const I = Icon as typeof CalendarDays
                    return (
                      <span key={String(value)}>
                        <I size={17} />
                        {String(value)}
                      </span>
                    )
                  })}
                </div>
                <div className="sw-panel" style={{ marginTop: 22 }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={19} color="#16a66a" />
                    {offer.business_name}
                  </h2>
                  <Link to={`/providers/${offer.business_slug}`} className="sw-link">
                    View provider profile <ArrowRight size={14} />
                  </Link>
                  <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
                    {whatsapp ? (
                      <a
                        className="sw-button"
                        style={{ background: '#159b5c' }}
                        href={whatsapp}
                        onClick={() => {
                          if (user)
                            void rpc('marketplace_record_contact', {
                              p_offer_id: offer.id,
                              p_channel: 'whatsapp',
                            }).catch((ex: Error) =>
                              setError(`Contact tracking failed: ${ex.message}`),
                            )
                        }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle size={17} />
                        Chat on WhatsApp
                      </a>
                    ) : (
                      <button className="sw-button secondary" disabled>
                        WhatsApp not configured
                      </button>
                    )}
                    {offer.business_phone && (
                      <a
                        className="sw-button secondary"
                        href={`tel:${offer.business_phone}`}
                        onClick={() => {
                          if (user)
                            void rpc('marketplace_record_contact', {
                              p_offer_id: offer.id,
                              p_channel: 'phone',
                            }).catch((ex: Error) =>
                              setError(`Contact tracking failed: ${ex.message}`),
                            )
                        }}
                      >
                        <Phone size={16} />
                        Call {rental ? 'Agency' : 'Seller'}
                      </a>
                    )}
                    <p style={{ fontSize: 10, color: '#7d8da2' }}>
                      WhatsApp opens a prefilled conversation. You choose whether to send it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <section className="sw-panel" style={{ maxWidth: 900, marginBottom: 35 }}>
              <h2>{rental ? 'Request this rental' : 'Enquire about this car'}</h2>
              {!user ? (
                <p>
                  <Link to="/sign-in" className="sw-link">
                    Sign in
                  </Link>{' '}
                  or{' '}
                  <Link to="/register/customer" className="sw-link">
                    create a customer account
                  </Link>{' '}
                  to {rental ? 'request a booking' : 'send an enquiry'}.
                </p>
              ) : rental ? (
                <form className="sw-form-grid" onSubmit={(e) => void book(e)}>
                  <div>
                    <label htmlFor="booking-from">Pickup date & time</label>
                    <input
                      className="sw-input"
                      type="datetime-local"
                      id="booking-from"
                      required
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-to">Return date & time</label>
                    <input
                      className="sw-input"
                      type="datetime-local"
                      id="booking-to"
                      required
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-pickup">Pickup location</label>
                    <input
                      className="sw-input"
                      id="booking-pickup"
                      name="pickup"
                      defaultValue={offer.location}
                      required
                      maxLength={160}
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-return">Return location</label>
                    <input
                      className="sw-input"
                      id="booking-return"
                      name="return"
                      defaultValue={offer.location}
                      required
                      maxLength={160}
                    />
                  </div>
                  <div className="wide">
                    <label htmlFor="booking-driver">Authorized driver’s full name</label>
                    <input
                      className="sw-input"
                      id="booking-driver"
                      name="driver"
                      required
                      minLength={2}
                    />
                  </div>
                  <div className="wide sw-notice">
                    {from && to && new Date(to) > new Date(from) ? (
                      <>
                        Estimated rental:{' '}
                        {money(
                          Math.max(
                            1,
                            Math.ceil(
                              (new Date(to).getTime() - new Date(from).getTime()) / 86400000,
                            ),
                          ) * offer.price_minor,
                          offer.currency,
                        )}
                        .{' '}
                      </>
                    ) : null}
                    Refundable security deposit: {money(offer.deposit_minor, offer.currency)}. Final
                    pricing is validated on the server. This request does not charge a payment
                    method.
                  </div>
                  <label className="wide" style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                    <input type="checkbox" name="terms" required />I understand that agency
                    confirmation is required, and that driver documents and the agency’s rental
                    terms must be verified before pickup.
                  </label>
                  <button className="sw-button wide" disabled={busy}>
                    {busy ? 'Saving request…' : 'Request Booking'}
                    <ArrowRight size={15} />
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void enquiry(e)}>
                  <label htmlFor="enquiry-message">Your message to {offer.business_name}</label>
                  <textarea
                    className="sw-input"
                    id="enquiry-message"
                    name="message"
                    rows={4}
                    minLength={3}
                    maxLength={4000}
                    required
                    defaultValue={`Hello, I’m interested in your ${offer.title}. Is it still available?`}
                  />
                  <button className="sw-button" disabled={busy} style={{ marginTop: 15 }}>
                    {busy ? 'Saving…' : 'Send Enquiry'}
                    <ArrowRight size={15} />
                  </button>
                </form>
              )}
              {!rental && user && (offer.test_drives_available || offer.financing_available) && (
                <SaleRequestForm offer={offer} />
              )}
              {offer.rental_terms && rental && (
                <details style={{ marginTop: 20, fontSize: 12 }}>
                  <summary>Agency rental terms</summary>
                  <p style={{ whiteSpace: 'pre-wrap', marginTop: 12, lineHeight: 1.8 }}>
                    {offer.rental_terms}
                  </p>
                </details>
              )}
              {error && (
                <p
                  role="alert"
                  className="sw-notice"
                  style={{ marginTop: 16, color: '#cc1530', background: '#fff0f2' }}
                >
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="sw-notice" style={{ marginTop: 16 }}>
                  {message}{' '}
                  <Link to="/customer/dashboard" className="sw-link">
                    View your dashboard
                  </Link>
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <PublicFooter />
    </div>
  )
}
export function ProviderPage() {
  const { slug } = useParams()
  const offers = useQuery({
    queryKey: ['swahivo', 'provider-listings', slug],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_catalogue')
        .select('*')
        .eq('business_slug', slug!)
      if (r.error) throw r.error
      return withPhotos(r.data ?? [])
    },
  })
  const query = useQuery({
    queryKey: ['swahivo', 'provider', slug],
    queryFn: async () => {
      const result = await marketplaceClient()
        .from('marketplace_businesses')
        .select('*')
        .eq('slug', slug!)
        .maybeSingle()
      if (result.error) throw result.error
      return result.data
    },
  })
  const business = query.data
  const reviews = useQuery({
    queryKey: ['swahivo', 'provider-reviews', business?.organization_id],
    enabled: !!business,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_reviews')
        .select('id,rating,body,created_at')
        .eq('organization_id', business!.organization_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(30)
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const branding = useQuery({
    queryKey: ['swahivo', 'provider-branding', business?.logo_path, business?.banner_path],
    enabled: !!business,
    queryFn: async () => {
      const sign = async (path: string | null) => {
        if (!path) return null
        const r = await marketplaceClient()
          .storage.from('marketplace-media')
          .createSignedUrl(path, 3600)
        if (r.error) throw r.error
        return r.data.signedUrl
      }
      const [logo, banner] = await Promise.all([
        sign(business!.logo_path),
        sign(business!.banner_path),
      ])
      return { logo, banner }
    },
  })
  return (
    <div className="sw-page">
      <PublicHeader />
      <main className="sw-container sw-section">
        {business ? (
          <section className="sw-panel">
            <span className="sw-status">Approved Swahivo business</span>
            {branding.data?.banner && (
              <img
                src={branding.data.banner}
                alt={`${business.name} banner`}
                style={{
                  width: '100%',
                  maxHeight: 280,
                  objectFit: 'cover',
                  borderRadius: 10,
                  marginTop: 20,
                }}
              />
            )}
            {branding.data?.logo && (
              <img
                src={branding.data.logo}
                alt={`${business.name} logo`}
                style={{ width: 120, height: 90, objectFit: 'contain', marginTop: 20 }}
              />
            )}
            {branding.error && <p role="alert">Business images could not be loaded.</p>}
            <h1 style={{ fontSize: 35, marginBlock: 18 }}>{business.name}</h1>
            <p className="sw-card-location">
              <MapPin size={15} />
              {business.city}, {business.region}
            </p>
            <p style={{ maxWidth: 700, marginBlock: 25, lineHeight: 1.8 }}>
              {business.description}
            </p>
            <div className="sw-hero-actions">
              {business.business_phone && (
                <a className="sw-button secondary" href={`tel:${business.business_phone}`}>
                  Call Business
                </a>
              )}
              <Link className="sw-button" to="#provider-vehicles">
                Explore vehicles
              </Link>
            </div>
          </section>
        ) : (
          <EmptyMarketplace
            title={query.error ? 'Could not load provider' : 'Provider unavailable'}
          >
            {query.error?.message ?? 'This business has not published a public profile.'}
          </EmptyMarketplace>
        )}
        {business && (
          <section className="sw-panel" style={{ marginTop: 24 }}>
            <h2>Customer Reviews</h2>
            {reviews.error && <p role="alert">{reviews.error.message}</p>}
            {reviews.data?.length ? (
              reviews.data.map((review) => (
                <article
                  key={review.id}
                  style={{ padding: '18px 0', borderBottom: '1px solid #e4eaf2' }}
                >
                  <strong style={{ color: '#f49b0b' }}>{fieldText(review.rating)} / 5</strong>
                  <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{fieldText(review.body)}</p>
                  <small>{new Date(fieldText(review.created_at)).toLocaleDateString()}</small>
                </article>
              ))
            ) : (
              <p style={{ marginTop: 12, color: '#68778b' }}>No published customer reviews yet.</p>
            )}
          </section>
        )}
        <section className="sw-section" id="provider-vehicles">
          <div className="sw-section-head">
            <h2>Vehicles from {business?.name ?? 'this provider'}</h2>
          </div>
          {offers.error ? (
            <EmptyMarketplace title="Listings could not be loaded">
              {offers.error.message}
            </EmptyMarketplace>
          ) : offers.data?.length ? (
            <div className="sw-listings">
              {offers.data.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <EmptyMarketplace title="No published vehicles yet">
              This provider has not published any vehicles to the marketplace.
            </EmptyMarketplace>
          )}
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

function SaleRequestForm({ offer }: { offer: Offer }) {
  const [kind, setKind] = useState(offer.test_drives_available ? 'test_drive' : 'finance')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      await rpc('marketplace_customer_request', {
        p_offer_id: offer.id,
        p_kind: kind,
        p_message: fieldText(data.get('message')),
        p_from: kind === 'test_drive' ? new Date(fieldText(data.get('from'))).toISOString() : null,
        p_to: kind === 'test_drive' ? new Date(fieldText(data.get('to'))).toISOString() : null,
      })
      setSuccess('Your request was saved. The provider will review it in their dashboard.')
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not save your request.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="sw-form-grid"
      onSubmit={(e) => void submit(e)}
      style={{ marginTop: 30, paddingTop: 24, borderTop: '1px solid #e4eaf3' }}
    >
      <div className="wide">
        <label htmlFor="sale-request-kind">Request a provider service</label>
        <select
          id="sale-request-kind"
          className="sw-input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {offer.test_drives_available && <option value="test_drive">Request a test drive</option>}
          {offer.financing_available && <option value="finance">Ask about financing</option>}
        </select>
      </div>
      {kind === 'test_drive' && (
        <>
          <div>
            <label htmlFor="drive-from">Appointment start</label>
            <input
              id="drive-from"
              name="from"
              type="datetime-local"
              className="sw-input"
              required
            />
          </div>
          <div>
            <label htmlFor="drive-to">Appointment end</label>
            <input id="drive-to" name="to" type="datetime-local" className="sw-input" required />
          </div>
        </>
      )}
      <div className="wide">
        <label htmlFor="sale-request-message">Message</label>
        <textarea
          className="sw-input"
          name="message"
          id="sale-request-message"
          rows={3}
          required
          minLength={3}
          maxLength={4000}
        />
      </div>
      {kind === 'finance' && (
        <p className="wide sw-notice">
          This requests information from the provider. It is not a credit application or approval.
        </p>
      )}
      <button className="sw-button wide" disabled={busy}>
        {busy ? 'Saving request…' : 'Send Request'}
      </button>
      {error && (
        <p className="wide sw-notice" role="alert" style={{ color: '#c21' }}>
          {error}
        </p>
      )}
      {success && (
        <p className="wide sw-notice" role="status">
          {success}
        </p>
      )}
    </form>
  )
}
