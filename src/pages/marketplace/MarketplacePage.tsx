import { AdSlot } from '@/features/marketplace/Advertising'
import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CarFront,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Headphones,
  Heart,
  Fuel,
  Gauge,
  Settings2,
  Search,
  Users,
  KeyRound,
  Store,
  Truck,
  Zap,
  Menu,
  X,
  BadgeCheck,
  CircleDollarSign,
} from 'lucide-react'
import { Wordmark } from '@/components/brand/Wordmark'
import { useAuth } from '@/features/auth/auth-context'
import {
  listOffers,
  marketplaceClient,
  money,
  useMarketplaceAccount,
  type Offer,
  type ServiceType,
} from '@/features/marketplace/api'

export function PublicHeader({ dark = false }: { dark?: boolean }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <>
      <header className="sw-container sw-header" style={!dark ? { color: '#0b1830' } : undefined}>
        <Link to="/" aria-label="Swahivo home">
          <Wordmark tone={dark ? 'inverse' : 'default'} size="lg" />
        </Link>
        <nav className="sw-nav" aria-label="Marketplace navigation">
          <Link to="/">Home</Link>
          <Link to="/cars">Buy Cars</Link>
          <Link to="/rentals">Rent Cars</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/register/business">For Businesses</Link>
          <Link to={user ? '/dashboard' : '/sign-in'}>{user ? 'My Dashboard' : 'Sign in'}</Link>
          <Link className="sw-button" to="/register/business">
            List Your Vehicles <ArrowRight size={15} />
          </Link>
        </nav>
        <div className="sw-mobile-nav" style={{ display: 'none' }}>
          <Link to={user ? '/dashboard' : '/sign-in'} className="sw-link">
            {user ? 'Dashboard' : 'Sign in'}
          </Link>
          <button
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
            style={{ background: 'transparent', border: 0, color: 'inherit' }}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {open && (
        <nav
          className="sw-container"
          style={{
            padding: '15px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            background: '#0b1b2e',
            color: 'white',
            position: 'relative',
            zIndex: 12,
          }}
        >
          {[
            ['Home', '/'],
            ['Buy Cars', '/cars'],
            ['Rent Cars', '/rentals'],
            ['Pricing', '/pricing'],
            ['Register a business', '/register/business'],
          ].map(([label, url]) => (
            <Link key={url} to={url!} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  )
}
export function PublicFooter() {
  return (
    <footer className="sw-footer">
      <div className="sw-container">
        <div className="sw-footer-grid">
          <div>
            <Link to="/">
              <Wordmark tone="inverse" size="lg" />
            </Link>
            <p>
              Automotive marketplace & business SaaS.
              <br />
              East Africa based Zanzibar, Tanzania.
            </p>
          </div>
          <div>
            <h4>Find your drive</h4>
            <div className="sw-footer-links">
              <Link to="/cars">Cars for sale</Link>
              <Link to="/rentals">Rental vehicles</Link>
              <Link to="/customer/dashboard">Saved vehicles</Link>
              <Link to="/pricing">Business packages</Link>
            </div>
          </div>
          <div>
            <h4>For businesses</h4>
            <div className="sw-footer-links">
              <Link to="/register/business?service=dealership">Sell your cars</Link>
              <Link to="/register/business?service=rental">List your rental fleet</Link>
              <Link to="/sign-in">Provider sign in</Link>
              <Link to="/dashboard">Manage your business</Link>
            </div>
          </div>
          <div>
            <h4>Two services. One platform.</h4>
            <p>
              Discover a car to own or a vehicle for your next journey. Contact each seller or
              rental agency directly through their listing.
            </p>
            <Link to="/register/customer" className="sw-button" style={{ marginTop: 16 }}>
              Join Swahivo <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <div className="sw-footer-bottom">
          <span>© {new Date().getFullYear()} Swahivo. All rights reserved.</span>
          <span>Car Dealership & Car Rental · East Africa based Zanzibar, Tanzania</span>
        </div>
      </div>
    </footer>
  )
}
export function SearchPanel({
  service: initial = 'dealership',
  switchable = false,
}: {
  service?: ServiceType
  switchable?: boolean
}) {
  const taxonomy = useQuery({
    queryKey: ['swahivo', 'public-taxonomy'],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_configuration')
        .select('*')
        .eq('published', true)
        .in('kind', ['brand', 'category'])
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const brands = [
    ...new Set([
      'Toyota',
      'Nissan',
      'Honda',
      'Suzuki',
      'Mitsubishi',
      'Mazda',
      'Isuzu',
      'Ford',
      'BMW',
      'Mercedes-Benz',
      'Volkswagen',
      'Audi',
      'Land Rover',
      'Hyundai',
      'Kia',
      ...(taxonomy.data ?? []).filter((x) => x.kind === 'brand').map((x) => x.name),
    ]),
  ].sort()
  const categories = [
    ...new Set([
      'SUV',
      'Sedan',
      'Hatchback',
      'Pickup',
      'Van',
      'Luxury',
      'Electric',
      'Motorbike',
      'Accessories',
      ...(taxonomy.data ?? []).filter((x) => x.kind === 'category').map((x) => x.name),
    ]),
  ]
  const [service, setService] = useState(initial)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const query = new URLSearchParams()
    data.forEach((value, key) => {
      if (fieldText(value)) query.set(key, fieldText(value))
    })
    const from = query.get('from'),
      to = query.get('to')
    if (from && to && new Date(to) <= new Date(from)) {
      event.currentTarget
        .querySelector<HTMLInputElement>('[name=to]')
        ?.setCustomValidity('Return must be after pickup.')
      event.currentTarget.reportValidity()
      return
    }
    void navigate(`/${service === 'rental' ? 'rentals' : 'cars'}?${query}`)
  }
  return (
    <div className="sw-search">
      <div className="sw-tabs">
        {(switchable ? ['dealership', 'rental'] : [service]).map((item) => (
          <button
            type="button"
            key={item}
            className={service === item ? 'active' : ''}
            onClick={() => setService(item as ServiceType)}
          >
            {item === 'rental' ? <KeyRound size={16} /> : <CarFront size={16} />}{' '}
            {item === 'rental' ? 'Rent Cars' : 'Buy Cars'}
          </button>
        ))}
      </div>
      <form className="sw-search-fields" onSubmit={search} key={service}>
        {service === 'rental' ? (
          <>
            <div>
              <label htmlFor="pickup-date">Pickup date & time</label>
              <input
                className="sw-input"
                id="pickup-date"
                name="from"
                type="datetime-local"
                defaultValue={params.get('from') ?? ''}
                required
              />
            </div>
            <div>
              <label htmlFor="return-date">Return date & time</label>
              <input
                className="sw-input"
                id="return-date"
                name="to"
                type="datetime-local"
                defaultValue={params.get('to') ?? ''}
                onChange={(e) => e.currentTarget.setCustomValidity('')}
                required
              />
            </div>
            <div>
              <label htmlFor="rental-category">Vehicle category</label>
              <select
                className="sw-input"
                id="rental-category"
                name="category"
                defaultValue={params.get('category') ?? ''}
              >
                <option value="">ALL</option>
                {['Economy', 'Sedan', 'SUV', 'Luxury', 'Van', '4x4'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="brand-search">Brand</label>
              <select
                className="sw-input"
                id="brand-search"
                name="make"
                defaultValue={params.get('make') ?? ''}
              >
                <option value="">ALL</option>
                {brands.map((brand) => (
                  <option key={brand}>{brand}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="model-search">Model</label>
              <input
                className="sw-input"
                id="model-search"
                name="model"
                placeholder="Any model"
                defaultValue={params.get('model') ?? ''}
              />
            </div>
            <div>
              <label htmlFor="condition-search">Condition</label>
              <select
                className="sw-input"
                id="condition-search"
                name="condition"
                defaultValue={params.get('condition') ?? ''}
              >
                <option value="">New & used cars</option>
                <option value="new">New cars</option>
                <option value="used">Used cars</option>
              </select>
            </div>
            <div>
              <label htmlFor="price-search">Maximum price (TZS)</label>
              <input
                className="sw-input"
                id="price-search"
                name="maxPrice"
                type="number"
                min="0"
                placeholder="Any price"
                defaultValue={params.get('maxPrice') ?? ''}
              />
            </div>
          </>
        )}
        {service === 'dealership' && (
          <div>
            <label htmlFor="category-search">Category</label>
            <select
              id="category-search"
              name="category"
              className="sw-input"
              defaultValue={params.get('category') ?? ''}
            >
              <option value="">ALL</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
        )}
        {service === 'rental' && (
          <div>
            <label htmlFor="rental-max-price">Maximum daily rate (TZS)</label>
            <input
              className="sw-input"
              id="rental-max-price"
              name="maxPrice"
              type="number"
              min="0"
              placeholder="Any daily rate"
              defaultValue={params.get('maxPrice') ?? ''}
            />
          </div>
        )}
        <div>
          <label htmlFor="location-search">
            {service === 'rental' ? 'Pickup location' : 'Location'}
          </label>
          <select
            className="sw-input"
            id="location-search"
            name="location"
            defaultValue={params.get('location') ?? ''}
          >
            <option value="">All locations</option>
            {['Dar es Salaam', 'Zanzibar', 'Arusha', 'Mwanza', 'Dodoma'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <button className="sw-button" type="submit">
          <Search size={16} /> Search {service === 'rental' ? 'Rentals' : 'Cars'}
        </button>
      </form>
    </div>
  )
}
export function EmptyMarketplace({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sw-empty">
      <CarFront size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
export function OfferCard({ offer }: { offer: Offer }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const cache = useQueryClient()
  const saved = useQuery({
    queryKey: ['swahivo', 'saved', user?.id, offer.id],
    enabled: !!user,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_favorites')
        .select('offer_id')
        .eq('user_id', user!.id)
        .eq('offer_id', offer.id)
      if (r.error) throw r.error
      return !!r.data?.length
    },
  })
  async function toggle() {
    if (!user) {
      void navigate('/sign-in')
      return
    }
    setError('')
    const result = saved.data
      ? await marketplaceClient()
          .from('marketplace_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('offer_id', offer.id)
      : await marketplaceClient()
          .from('marketplace_favorites')
          .insert({ user_id: user.id, offer_id: offer.id })
    if (result.error) setError(result.error.message)
    else await cache.invalidateQueries({ queryKey: ['swahivo', 'saved'] })
  }
  return (
    <article className="sw-card">
      <div className="sw-card-image">
        {offer.image_urls?.[0] ? (
          <img src={offer.image_urls[0]} alt={offer.title} loading="lazy" />
        ) : (
          <CarFront />
        )}
        <span className="sw-pill">
          {offer.service === 'rental' ? 'For Rent' : offer.condition === 'new' ? 'New' : 'For Sale'}
        </span>
        <button
          aria-label={saved.data ? 'Remove saved vehicle' : 'Save vehicle'}
          className="sw-save"
          onClick={() => void toggle()}
        >
          <Heart
            fill={saved.data ? '#f7102c' : 'none'}
            color={saved.data ? '#f7102c' : '#64758d'}
          />
        </button>
      </div>
      <div className="sw-card-body">
        <h3>{offer.title}</h3>
        <div className="sw-price">
          {money(offer.price_minor, offer.currency)}
          {offer.service === 'rental' && <small> / day</small>}
        </div>
        <div className="sw-card-specs">
          <span>
            <CalendarDays />
            {offer.model_year}
          </span>
          <span>
            <Gauge />
            {offer.mileage.toLocaleString()} km
          </span>
          <span>
            <Fuel />
            {offer.fuel_type}
          </span>
          <span>
            <Settings2 />
            {offer.transmission}
          </span>
        </div>
        <div className="sw-card-location">
          <MapPin size={12} />
          {offer.location} · {offer.business_name}
        </div>
        <Link
          className="sw-button"
          to={`/${offer.service === 'rental' ? 'rentals' : 'cars'}/${offer.slug}`}
        >
          View Details <ArrowRight size={13} />
        </Link>
        {error && (
          <p role="alert" style={{ color: '#e11', fontSize: 11 }}>
            {error}
          </p>
        )}
      </div>
    </article>
  )
}
export function MarketplacePage({ service }: { service?: ServiceType }) {
  const [params] = useSearchParams()
  const rental = service === 'rental'
  const catalogue = useQuery({
    queryKey: ['swahivo', 'catalogue', service ?? 'home', params.toString()],
    queryFn: () => listOffers(service ?? 'dealership', params),
  })
  const rentals = useQuery({
    queryKey: ['swahivo', 'home-rentals'],
    queryFn: () => listOffers('rental'),
    enabled: !service,
  })
  const categories = rental
    ? ([
        ['Economy', CarFront, 'Everyday journeys'],
        ['Sedan', CarFront, 'Comfort on the road'],
        ['SUV', Truck, 'Room to explore'],
        ['Luxury', CarFront, 'Travel in style'],
        ['Van', Users, 'Bring everyone'],
        ['4x4', Truck, 'Beyond the ordinary'],
      ] as const)
    : ([
        ['New Cars', CarFront, 'Your next beginning'],
        ['Used Cars', CarFront, 'Find your next car'],
        ['SUV', Truck, 'Built for more'],
        ['Sedan', CarFront, 'Everyday elegance'],
        ['Electric', Zap, 'A different kind of drive'],
        ['Luxury', CarFront, 'Arrive in style'],
      ] as const)
  return (
    <div className="sw-page">
      <section className="sw-hero">
        <PublicHeader dark />
        <div className="sw-container sw-hero-body">
          <div className="sw-hero-copy">
            <p className="sw-eyebrow">Tanzania & Zanzibar · One automotive marketplace</p>
            <h1>
              {rental ? (
                <>
                  Your Journey.
                  <br />
                  Your Car. <span>Your Freedom.</span>
                </>
              ) : (
                <>
                  Find Your
                  <br />
                  <span>Perfect Drive</span>
                </>
              )}
            </h1>
            <p>
              {rental
                ? 'Find rental vehicles from providers across East Africa.'
                : service
                  ? 'Discover new and pre-owned vehicles. Connect directly with the business behind your next car.'
                  : 'Buy, sell, and rent quality vehicles across Tanzania and Zanzibar — all in one trusted automotive marketplace.'}
            </p>
            <div className="sw-hero-actions">
              <a className="sw-button" href="#discover">
                {rental ? 'Find a Rental Car' : 'Browse All Cars'} <ArrowRight size={15} />
              </a>
              <Link
                className="sw-button outline"
                to={
                  rental
                    ? '/register/business?service=rental'
                    : '/register/business?service=dealership'
                }
              >
                {rental ? 'List Your Rental Fleet' : 'Sell Your Car'} <Store size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="sw-container sw-search-wrap">
        <SearchPanel service={service ?? 'dealership'} switchable={!service} />
        {!service && <AdSlot placement="home_hero" />}
      </div>
      <div className="sw-container">
        <div className="sw-trust">
          {[
            [ShieldCheck, 'Provider approval', 'Businesses reviewed before publishing'],
            [BadgeCheck, 'Real vehicle details', 'Explore published listings'],
            [CircleDollarSign, 'Clear pricing', 'Sale prices and daily rental rates'],
            [Headphones, 'Direct contact', 'Speak with the owning provider'],
          ].map(([Icon, title, description]) => {
            const I = Icon as typeof ShieldCheck
            return (
              <div className="sw-trust-item" key={String(title)}>
                <I />
                <div>
                  <strong>{String(title)}</strong>
                  {String(description)}
                </div>
              </div>
            )
          })}
        </div>
        <section className="sw-section">
          <div className="sw-section-head">
            <div>
              <p style={{ marginBottom: 5 }}>Explore your options</p>
              <h2>{rental ? 'A vehicle for every journey' : 'Find your kind of drive'}</h2>
            </div>
            <Link className="sw-link" to={rental ? '/rentals' : '/cars'}>
              Explore all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="sw-category-grid">
            {categories.map(([label, Icon, sub]) => (
              <Link
                className="sw-category"
                key={label}
                to={`/${rental ? 'rentals' : 'cars'}?${label === 'New Cars' ? 'condition=new' : label === 'Used Cars' ? 'condition=used' : `category=${encodeURIComponent(label)}`}`}
              >
                <Icon />
                <strong>{label}</strong>
                <span>{sub}</span>
                <i>›</i>
              </Link>
            ))}
          </div>
        </section>
        <section className="sw-section" id="discover">
          <AdSlot placement={service ? (rental ? 'rentals_top' : 'cars_top') : 'home_featured'} />
          <div className="sw-section-head">
            <div>
              <h2>
                {rental ? 'Available rental vehicles' : 'Discover vehicles across East Africa'}
              </h2>
              <p>
                {catalogue.data?.length ?? 0} published {rental ? 'rental vehicles' : 'vehicles'} ·
                Contact the provider for details
              </p>
            </div>
            <Link className="sw-link" to={rental ? '/rentals' : '/cars'}>
              View all vehicles <ArrowRight size={14} />
            </Link>
          </div>
          {catalogue.isPending ? (
            <EmptyMarketplace title="Finding your next drive">
              Loading live vehicle listings…
            </EmptyMarketplace>
          ) : catalogue.error ? (
            <EmptyMarketplace title="Listings could not be loaded">
              {catalogue.error.message}
            </EmptyMarketplace>
          ) : catalogue.data?.length ? (
            <div className="sw-listings">
              {catalogue.data.slice(0, service ? 100 : 8).map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <EmptyMarketplace title="Your next drive is on its way">
              {params.size
                ? 'No published vehicles match these filters. Try another location, category, or period.'
                : 'Approved businesses can publish their first vehicles here. Register your business to bring your showroom or rental fleet to Swahivo.'}
            </EmptyMarketplace>
          )}
        </section>
        <section className="sw-promo">
          <div>
            <p className="sw-eyebrow">Made for the road ahead</p>
            <h2>
              {rental
                ? 'More freedom.\nMore possibilities.'
                : 'Drive your business forward with Swahivo'}
            </h2>
            <p>
              A dedicated showroom for your dealership. A complete workspace for your rental agency.
              Manage either service, or both, with one account.
            </p>
            <Link className="sw-button" to="/register/business">
              Register Your Business <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        {!service && (
          <section className="sw-section">
            <div className="sw-section-head">
              <div>
                <h2>Two ways to find your perfect drive</h2>
                <p>One account. A world of possibilities.</p>
              </div>
            </div>
            <div className="sw-service-grid">
              {[
                [
                  CarFront,
                  'Buy & sell cars',
                  'Browse the showroom, save your favorites, and speak directly to sellers.',
                  '/cars',
                ],
                [
                  KeyRound,
                  'Rent your next adventure',
                  'Choose your dates and discover rental vehicles from local agencies.',
                  '/rentals',
                ],
              ].map(([Icon, title, description, url]) => {
                const I = Icon as typeof CarFront
                return (
                  <article className="sw-service-card" key={String(url)}>
                    <div className="sw-service-icon">
                      <I size={30} />
                    </div>
                    <div>
                      <h3>{String(title)}</h3>
                      <p>{String(description)}</p>
                      <Link className="sw-link" to={String(url)}>
                        Explore{' '}
                        {String(title).startsWith('Buy') ? 'cars for sale' : 'rental vehicles'}{' '}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        {!service && !!rentals.data?.length && (
          <section className="sw-section">
            <div className="sw-section-head">
              <div>
                <h2>Make the journey yours</h2>
                <p>Rental vehicles from local agencies</p>
              </div>
              <Link className="sw-link" to="/rentals">
                Explore rentals <ArrowRight size={14} />
              </Link>
            </div>
            <div className="sw-listings">
              {rentals.data.slice(0, 4).map((o) => (
                <OfferCard key={o.id} offer={o} />
              ))}
            </div>
          </section>
        )}
        <section className="sw-section">
          <div className="sw-section-head">
            <div>
              <h2>Built around your business</h2>
              <p>Dealership, rental agency, or both — choose the services you offer.</p>
            </div>
          </div>
          <div className="sw-service-grid">
            <div className="sw-service-card">
              <div className="sw-service-icon">
                <Store />
              </div>
              <div>
                <h3>Your showroom, online</h3>
                <p>
                  Publish sale listings, respond to enquiries, and follow each opportunity through
                  your sales pipeline.
                </p>
                <Link className="sw-link" to="/pricing">
                  Explore dealership packages <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="sw-service-card">
              <div className="sw-service-icon">
                <CalendarDays />
              </div>
              <div>
                <h3>Your fleet, under control</h3>
                <p>
                  Manage rental availability, reservations, contracts, payments, pickups and returns
                  in one workspace.
                </p>
                <Link className="sw-link" to="/register/business?service=rental">
                  Register your rental agency <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      {!service && (
        <div className="sw-container">
          <AdSlot placement="provider_spotlight" />
        </div>
      )}
      <PublicFooter />
    </div>
  )
}
export function DashboardRedirect() {
  const { status } = useAuth()
  const account = useMarketplaceAccount()
  if (status === 'unauthenticated') return <Redirect to="/sign-in" />
  if (account.isPending) return <div className="sw-empty">Loading your workspace…</div>
  if (account.error) return <div className="sw-empty">{account.error.message}</div>
  const a = account.data
  return (
    <Redirect
      to={
        a?.is_admin
          ? '/admin/dashboard'
          : a?.businesses.some((b) => b.services.includes('dealership'))
            ? '/seller/dashboard'
            : a?.businesses.some((b) => b.services.includes('rental'))
              ? '/rental/marketplace/dashboard'
              : a?.applications.some((application) => application.status === 'pending')
                ? '/provider/onboarding'
                : '/customer/dashboard'
      }
    />
  )
}
function Redirect({ to }: { to: string }) {
  return <Navigate to={to} replace />
}
