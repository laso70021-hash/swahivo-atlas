import { fieldText } from '@/features/marketplace/api'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CarFront, Building2, MessageCircle, ShieldCheck } from 'lucide-react'
import { marketplaceClient, rpc, money, type Application } from '@/features/marketplace/api'
import { DashboardHeading, Metrics } from './DashboardShell'
import { EmptyMarketplace } from './MarketplacePage'
import { CRMPage } from './ProviderPages'

export function AdminPage() {
  const { module = 'dashboard' } = useParams()
  const cache = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const summary = useQuery({
    queryKey: ['swahivo', 'admin-summary'],
    queryFn: () => rpc<Record<string, number>>('marketplace_admin_summary'),
  })
  const applications = useQuery({
    queryKey: ['swahivo', 'applications'],
    enabled: ['dashboard', 'applications'].includes(module),
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('business_applications')
        .select('*')
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const selections = useQuery({
    queryKey: ['swahivo', 'admin-plan-selections'],
    queryFn: async () => {
      const r = await marketplaceClient().from('marketplace_plan_selections').select('*')
      if (r.error) throw r.error
      return r.data
    },
  })
  const businesses = useQuery({
    queryKey: ['swahivo', 'businesses'],
    enabled: ['dashboard', 'businesses'].includes(module),
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_businesses')
        .select('*')
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const services = useQuery({
    queryKey: ['swahivo', 'admin-services'],
    enabled: module === 'businesses',
    queryFn: async () => {
      const result = await marketplaceClient().from('business_service_access').select('*')
      if (result.error) throw result.error
      return result.data ?? []
    },
  })
  async function changeService(organizationId: string, service: string, enabled: boolean) {
    setError('')
    setBusy(organizationId)
    try {
      await rpc('marketplace_admin_service', {
        p_organization_id: organizationId,
        p_service: service,
        p_enabled: enabled,
      })
      await cache.invalidateQueries({ queryKey: ['swahivo'] })
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Service change failed.')
    } finally {
      setBusy(null)
    }
  }
  const offers = useQuery({
    queryKey: ['swahivo', 'admin-offers', module],
    enabled: ['listings', 'approvals'].includes(module),
    queryFn: async () => {
      let q = marketplaceClient()
        .from('marketplace_offers')
        .select('*')
        .order('created_at', { ascending: false })
      if (module === 'approvals') q = q.eq('status', 'pending')
      const r = await q
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const enquiries = useQuery({
    queryKey: ['swahivo', 'admin-enquiries'],
    enabled: module === 'enquiries',
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_enquiries')
        .select('*')
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const reservations = useQuery({
    queryKey: ['swahivo', 'admin-reservations'],
    enabled: module === 'reservations',
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_reservations')
        .select('*')
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const packages = useQuery({
    queryKey: ['swahivo', 'admin-packages'],
    enabled: module === 'packages',
    queryFn: async () => {
      const r = await marketplaceClient().from('service_packages').select('*').order('monthly_tzs')
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const audit = useQuery({
    queryKey: ['swahivo', 'audit'],
    enabled: module === 'audit',
    queryFn: () =>
      rpc<Array<{ id: string; action: string; created_at: string }>>('marketplace_audit_log'),
  })
  async function reviewApplication(application: Application, approve: boolean) {
    setError('')
    setBusy(application.id)
    try {
      await rpc('marketplace_review_application', {
        p_application_id: application.id,
        p_approve: approve,
        p_services: application.requested_services,
        p_note: approve
          ? 'Business services approved.'
          : 'Please contact the platform administrator about your application.',
      })
      await applications.refetch()
      await summary.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Review failed.')
    } finally {
      setBusy(null)
    }
  }
  async function reviewOffer(id: string, approve: boolean) {
    setError('')
    setBusy(id)
    try {
      await rpc('marketplace_review_offer', { p_offer_id: id, p_approve: approve })
      await offers.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Listing review failed.')
    } finally {
      setBusy(null)
    }
  }
  const title: Record<string, string> = {
    dashboard: 'Platform Dashboard',
    applications: 'Business Applications',
    businesses: 'Businesses',
    listings: 'Vehicle Listings',
    approvals: 'Listing Approvals',
    enquiries: 'Buyer & Rental Enquiries',
    reservations: 'Rental Reservations',
    packages: 'Subscription Packages',
    audit: 'Audit Logs',
  }
  if (module === 'crm') return <CRMPage admin />
  return (
    <>
      <DashboardHeading
        title={title[module] ?? 'Platform Dashboard'}
        description="Swahivo · Car Dealership & Car Rental · Platform administration"
        action={
          <Link className="sw-button secondary" to="/">
            View Marketplace →
          </Link>
        }
      />
      {error && (
        <p role="alert" className="sw-notice" style={{ marginBottom: 20, color: '#c31530' }}>
          {error}
        </p>
      )}
      {module === 'dashboard' && (
        <>
          <Metrics
            items={[
              {
                label: 'Approved Businesses',
                value: summary.data?.businesses ?? 0,
                icon: Building2,
              },
              { label: 'Sale Listings', value: summary.data?.sale_listings ?? 0, icon: CarFront },
              {
                label: 'Rental Listings',
                value: summary.data?.rental_listings ?? 0,
                icon: CarFront,
              },
              {
                label: 'Pending Applications',
                value: summary.data?.pending_applications ?? 0,
                icon: ShieldCheck,
              },
            ]}
          />
          {summary.error && <p role="alert">{summary.error.message}</p>}
          <div className="sw-service-grid" style={{ marginBlock: 24 }}>
            <section className="sw-panel">
              <h2>Marketplace activity</h2>
              <Metrics
                items={[
                  { label: 'Enquiries', value: summary.data?.enquiries ?? 0, icon: MessageCircle },
                  { label: 'Reservations', value: summary.data?.reservations ?? 0, icon: CarFront },
                ]}
              />
            </section>
            <section className="sw-panel">
              <h2>Quick Actions</h2>
              <div className="sw-form-grid">
                {[
                  ['Review Businesses', 'applications'],
                  ['Approve Listings', 'approvals'],
                  ['Manage Packages', 'packages'],
                  ['View CRM', 'crm'],
                ].map(([label, path]) => (
                  <Link className="sw-button secondary" key={path} to={`/admin/${path}`}>
                    {label}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
      {['dashboard', 'applications'].includes(module) && (
        <section className="sw-panel" style={{ marginTop: 24, overflowX: 'auto' }}>
          <h2>Business Applications</h2>
          {applications.error ? (
            <p role="alert">{applications.error.message}</p>
          ) : applications.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Services Requested</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {applications.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.business_name}</strong>
                      <br />
                      <span style={{ color: '#75859a' }}>{a.business_phone}</span>
                    </td>
                    <td>{a.requested_services.join(' & ')}</td>
                    <td>
                      {a.city}, {a.region}
                    </td>
                    <td>
                      <span className="sw-status">{a.status}</span>
                      {a.requested_services.map((service) => (
                        <p key={service}>
                          {service}:{' '}
                          {selections.data?.find(
                            (s) => s.application_id === a.id && s.service === service,
                          )?.status ?? 'Plan not selected'}
                        </p>
                      ))}
                      <Link className="sw-link" to="/admin/marketing">
                        Review payment orders
                      </Link>
                    </td>
                    <td>
                      {a.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            className="sw-button"
                            disabled={
                              busy === a.id ||
                              !a.requested_services.every((service) =>
                                selections.data?.some(
                                  (s) =>
                                    s.application_id === a.id &&
                                    s.service === service &&
                                    ['free', 'paid'].includes(s.status),
                                ),
                              )
                            }
                            onClick={() => void reviewApplication(a, true)}
                          >
                            Approve
                          </button>
                          <button
                            className="sw-button secondary"
                            disabled={busy === a.id}
                            onClick={() => void reviewApplication(a, false)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        'Reviewed'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No applications awaiting review">
              New business registrations and service requests appear here.
            </EmptyMarketplace>
          )}
        </section>
      )}
      {module === 'businesses' && (
        <div className="sw-panel" style={{ overflowX: 'auto' }}>
          {businesses.error ? (
            <p role="alert">{businesses.error.message}</p>
          ) : (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Location</th>
                  <th>Phone</th>
                  <th>Profile</th>
                  <th>Approved Services</th>
                </tr>
              </thead>
              <tbody>
                {businesses.data?.map((b) => (
                  <tr key={b.organization_id}>
                    <td>{b.name}</td>
                    <td>{b.city || 'Not configured'}</td>
                    <td>{b.business_phone || 'Not configured'}</td>
                    <td>
                      <Link className="sw-link" to={`/providers/${b.slug}`}>
                        View Public Profile
                      </Link>
                    </td>
                    <td>
                      {services.error ? (
                        <span role="alert">{services.error.message}</span>
                      ) : (
                        ['dealership', 'rental'].map((service) => {
                          const enabled =
                            services.data?.some(
                              (row) =>
                                row.organization_id === b.organization_id &&
                                row.service === service,
                            ) ?? false
                          return (
                            <label className="flex items-center gap-2" key={service}>
                              <input
                                type="checkbox"
                                aria-label={`${b.name}: ${service}`}
                                checked={enabled}
                                disabled={services.isPending || busy === b.organization_id}
                                onChange={(e) =>
                                  void changeService(b.organization_id, service, e.target.checked)
                                }
                              />
                              {service === 'dealership' ? 'Car Dealership' : 'Car Rental'}
                            </label>
                          )
                        })
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {['listings', 'approvals'].includes(module) && (
        <div className="sw-panel" style={{ overflowX: 'auto' }}>
          {offers.error ? (
            <p role="alert">{offers.error.message}</p>
          ) : offers.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Service</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {offers.data.map((o) => (
                  <tr key={o.id}>
                    <td>{o.title}</td>
                    <td>{o.service}</td>
                    <td>{money(o.price_minor, o.currency)}</td>
                    <td>
                      <span className="sw-status">{o.status}</span>
                    </td>
                    <td>
                      {o.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            className="sw-button"
                            disabled={busy === o.id}
                            onClick={() => void reviewOffer(o.id, true)}
                          >
                            Publish
                          </button>
                          <button
                            className="sw-button secondary"
                            disabled={busy === o.id}
                            onClick={() => void reviewOffer(o.id, false)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <Link
                          className="sw-link"
                          to={`/${o.service === 'rental' ? 'rentals' : 'cars'}/${o.slug}`}
                        >
                          View Listing
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No listings in this view">
              Businesses must create and submit their vehicle listings before publication.
            </EmptyMarketplace>
          )}
        </div>
      )}
      {module === 'enquiries' && (
        <div className="sw-panel" style={{ overflowX: 'auto' }}>
          {enquiries.error ? (
            <p role="alert">{enquiries.error.message}</p>
          ) : enquiries.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Enquiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.customer_name}</td>
                    <td>{e.service}</td>
                    <td>{e.message}</td>
                    <td>{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No marketplace enquiries yet">
              This view contains genuine customer enquiries across both services.
            </EmptyMarketplace>
          )}
        </div>
      )}
      {module === 'reservations' && (
        <div className="sw-panel" style={{ overflowX: 'auto' }}>
          {reservations.error ? (
            <p role="alert">{reservations.error.message}</p>
          ) : reservations.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Pickup</th>
                  <th>Return</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.driver_name}</td>
                    <td>{new Date(b.starts_at).toLocaleString()}</td>
                    <td>{new Date(b.ends_at).toLocaleString()}</td>
                    <td>{money(b.total_minor, b.currency)}</td>
                    <td>{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No rental booking requests yet">
              Provider decisions are validated by the rental engine before a vehicle is reserved.
            </EmptyMarketplace>
          )}
        </div>
      )}
      {module === 'packages' && (
        <div className="sw-pricing">
          {packages.error && <p role="alert">{packages.error.message}</p>}
          {packages.data?.map((p) => (
            <form
              key={p.id}
              className="sw-plan"
              onSubmit={(e) => {
                e.preventDefault()
                const d = new FormData(e.currentTarget)
                setError('')
                void rpc('marketplace_update_package', {
                  p_package_id: p.id,
                  p_monthly_tzs: d.get('price') !== '' ? Number(d.get('price')) : null,
                  p_listing_limit: d.get('limit') !== '' ? Number(d.get('limit')) : null,
                  p_published: d.get('published') === 'on',
                  p_stripe_price_id: fieldText(d.get('stripe')) || null,
                })
                  .then(() => packages.refetch())
                  .catch((ex: Error) => setError(ex.message))
              }}
            >
              <span className="sw-status">{p.service}</span>
              <h3 style={{ marginBlock: 15 }}>{p.name}</h3>
              <label>
                Monthly price (TZS)
                <input
                  className="sw-input"
                  name="price"
                  type="number"
                  min="0"
                  defaultValue={p.monthly_tzs ?? ''}
                />
              </label>
              <label style={{ display: 'block', marginTop: 12 }}>
                Sale listing limit
                <input
                  className="sw-input"
                  name="limit"
                  type="number"
                  min="1"
                  defaultValue={p.listing_limit ?? ''}
                />
              </label>
              <label style={{ display: 'block', marginTop: 12 }}>
                Stripe price ID
                <input
                  className="sw-input"
                  name="stripe"
                  defaultValue={p.stripe_price_id ?? ''}
                  placeholder="price_…"
                />
              </label>
              <label className="flex gap-2" style={{ marginTop: 16, fontSize: 12 }}>
                <input type="checkbox" name="published" defaultChecked={p.published} />
                Publish this package
              </label>
              <button className="sw-button" style={{ marginTop: 18 }}>
                Save Package
              </button>
            </form>
          ))}
        </div>
      )}
      {module === 'audit' && (
        <div className="sw-panel" style={{ overflowX: 'auto' }}>
          {audit.error ? (
            <p role="alert">{audit.error.message}</p>
          ) : audit.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.action}</td>
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No audit events yet">
              Business and listing approval actions are recorded here.
            </EmptyMarketplace>
          )}
        </div>
      )}
    </>
  )
}
