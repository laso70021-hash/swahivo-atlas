import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CarFront,
  MessageCircle,
  UsersRound,
  Plus,
  ArrowRight,
  Check,
  Save,
  Upload,
  Building2,
} from 'lucide-react'

import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchTeamMembers } from '@/features/team/api'
import {
  marketplaceClient,
  rpc,
  withPhotos,
  money,
  normalizePhone,
  type ServiceType,
  type Lead,
} from '@/features/marketplace/api'
import {
  DashboardHeading,
  Metrics,
  useMarketBusiness,
  useOptionalMarketBusiness,
} from './DashboardShell'
import { EmptyMarketplace, OfferCard } from './MarketplacePage'
import { ProviderTrendChart, ListingStatusChart } from '@/features/marketplace/ProviderCharts'

export function useProviderOffers(service: ServiceType) {
  const business = useMarketBusiness()
  return useQuery({
    queryKey: ['swahivo', 'provider-offers', business.organization_id, service],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_offers')
        .select('*')
        .eq('organization_id', business.organization_id)
        .eq('service', service)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return withPhotos(
        (r.data ?? []).map((o) => ({
          ...o,
          business_name: business.name,
          business_slug: business.slug,
        })),
      )
    },
  })
}
export function ProviderDashboard({ service }: { service: ServiceType }) {
  const business = useMarketBusiness()
  const offers = useProviderOffers(service)
  const enquiries = useQuery({
    queryKey: ['swahivo', 'provider-enquiries', business.organization_id, service],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_enquiries')
        .select('*')
        .eq('organization_id', business.organization_id)
        .eq('service', service)
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const prefix = service === 'rental' ? '/rental/marketplace' : '/seller'
  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back to {business.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your {service === 'rental' ? 'rental listings and booking enquiries' : 'vehicles, enquiries, and sales opportunities'} with Swahivo.
          </p>
        </div>
        <Metrics
          items={[
          { label: 'Total Listings', value: offers.data?.length ?? 0, icon: CarFront },
          {
            label: 'Published Listings',
            value: offers.data?.filter((o) => o.status === 'published').length ?? 0,
            icon: Check,
          },
          { label: 'Total Enquiries', value: enquiries.data?.length ?? 0, icon: MessageCircle },
          {
            label: 'Pending Approval',
            value: offers.data?.filter((o) => o.status === 'pending').length ?? 0,
            icon: UsersRound,
          },
        ]}
        />
        <div
          className="sw-dashboard-chart-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,2fr) minmax(200px,1fr) minmax(200px,1fr)',
            gap: 20,
            marginTop: 24,
          }}
        >
          <section className="sw-panel">
            <h2>Enquiries & Sales</h2>
            {enquiries.error ? (
              <p role="alert">{enquiries.error.message}</p>
            ) : (
              <ProviderTrendChart enquiries={enquiries.data ?? []} />
            )}
          </section>
          <section className="sw-panel">
            <h2>Vehicle Status</h2>
            <ListingStatusChart offers={offers.data ?? []} />
          </section>
          <section className="sw-panel">
            <h2>Quick Actions</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Add a listing', 'listings/new', CarFront],
                ['Manage vehicles', 'listings', Building2],
                ['View enquiries', 'enquiries', MessageCircle],
                ['Customers / CRM', 'crm', UsersRound],
                ['Promote / Boost', 'promotions', ArrowRight],
                ['My Store Profile', 'profile', Building2],
                ['Subscription', 'subscription', Check],
              ].map(([label, url, Icon]) => {
                const I = Icon as typeof CarFront
                return (
                  <Link
                    key={String(url)}
                    className="sw-button secondary"
                    to={`${prefix}/${String(url)}`}
                  >
                    <I size={18} />
                    {String(label)}
                  </Link>
                )
              })}
            </div>
          </section>
        </div>
        <section className="sw-section">
          <div className="sw-section-head">
            <h2>My Vehicles</h2>
            <Link className="sw-link" to={`${prefix}/listings`}>
              Manage inventory <ArrowRight size={14} />
            </Link>
          </div>
          {offers.error ? (
            <EmptyMarketplace title="Listings could not be loaded">
              {offers.error.message}
            </EmptyMarketplace>
          ) : offers.data?.length ? (
            <div className="sw-listings">
              {offers.data.slice(0, 4).map((o) => (
                <div key={o.id}>
                  <OfferCard offer={o} />
                  <Link
                    className="sw-link"
                    style={{ marginTop: 10 }}
                    to={`${prefix}/listings/${o.id}/edit`}
                  >
                    Edit listing · {o.status}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyMarketplace title="Your showroom starts with a vehicle">
              Add a real vehicle, upload its photos, and submit your listing for approval.
            </EmptyMarketplace>
          )}
        </section>
      </div>
    </>
  )
}
export function ProviderListings({ service }: { service: ServiceType }) {
  const offers = useProviderOffers(service)
  const [filter, setFilter] = useState('all')
  const prefix = service === 'rental' ? '/rental/marketplace' : '/seller'
  return (
    <>
      <DashboardHeading
        title={service === 'rental' ? 'My Rental Listings' : 'My Vehicles for Sale'}
        description="Your real inventory, publication status, and listing details."
        action={
          <Link className="sw-button" to={`${prefix}/listings/new`}>
            <Plus size={17} />
            Add Listing
          </Link>
        }
      />
      <div className="sw-tabs" style={{ marginBottom: 24 }}>
        {['all', 'published', 'pending', 'draft', 'sold', 'archived'].map((status) => (
          <button
            key={status}
            className={filter === status ? 'active' : ''}
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)} (
            {offers.data?.filter((o) => status === 'all' || o.status === status).length ?? 0})
          </button>
        ))}
      </div>
      {offers.error ? (
        <EmptyMarketplace title="Could not load inventory">{offers.error.message}</EmptyMarketplace>
      ) : offers.data?.filter((o) => filter === 'all' || o.status === filter).length ? (
        <div className="sw-listings">
          {offers.data
            .filter((o) => filter === 'all' || o.status === filter)
            .map((o) => (
              <div key={o.id}>
                <OfferCard offer={o} />
                <Link
                  className="sw-button secondary"
                  style={{ width: '100%', marginTop: 9 }}
                  to={`${prefix}/listings/${o.id}/edit`}
                >
                  Edit · {o.status}
                </Link>
              </div>
            ))}
        </div>
      ) : (
        <EmptyMarketplace title="No listings in this view">
          Add a vehicle to start publishing your inventory.
        </EmptyMarketplace>
      )}
    </>
  )
}

export function ListingEditor({ service }: { service: ServiceType }) {
  const business = useMarketBusiness()
  const { id } = useParams()
  const navigate = useNavigate()
  const cache = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const prefix = service === 'rental' ? '/rental/marketplace' : '/seller'
  const existing = useQuery({
    queryKey: ['swahivo', 'edit-offer', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_offers')
        .select('*')
        .eq('id', id!)
        .eq('organization_id', business.organization_id)
        .single()
      if (r.error) throw r.error
      return r.data
    },
  })
  const fleet = useQuery({
    queryKey: ['swahivo', 'publication-fleet', business.organization_id],
    enabled: service === 'rental',
    queryFn: async () => {
      const r = await getSupabaseClient()
        .from('vehicles')
        .select('id,make,model,registration_plate')
        .eq('organization_id', business.organization_id)
        .is('archived_at', null)
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  if (id && existing.isPending)
    return (
      <EmptyMarketplace title="Loading listing">Fetching your vehicle details…</EmptyMarketplace>
    )
  if (existing.error)
    return (
      <EmptyMarketplace title="Could not load listing">{existing.error.message}</EmptyMarketplace>
    )
  const offer = existing.data
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    const uploaded: string[] = []
    let savedId = id
    try {
      const offerId = id ?? crypto.randomUUID()
      const payload = {
        id: offerId,
        organization_id: business.organization_id,
        service,
        title: fieldText(data.get('title')),
        make: fieldText(data.get('make')),
        model: fieldText(data.get('model')),
        model_year: Number(data.get('year')),
        condition: fieldText(data.get('condition')),
        category: fieldText(data.get('category')),
        price_minor: Math.round(Number(data.get('price')) * 100),
        currency: 'TZS',
        mileage: Number(data.get('mileage')),
        transmission: fieldText(data.get('transmission')),
        fuel_type: fieldText(data.get('fuel')),
        seats: Number(data.get('seats')),
        location: fieldText(data.get('location')),
        description: fieldText(data.get('description')),
        vehicle_id:
          service === 'rental' ? fieldText(data.get('vehicle')) : (offer?.vehicle_id ?? null),
        deposit_minor: Math.round(Number(data.get('deposit') ?? 0) * 100),
        self_drive: data.get('selfDrive') === 'on',
        test_drives_available: data.get('testDrives') === 'on',
        financing_available: data.get('financing') === 'on',
        rental_terms: fieldText(data.get('terms') ?? ''),
        chauffeur: data.get('chauffeur') === 'on',
        status: fieldText(data.get('intent') ?? 'pending'),
        images: offer?.images ?? [],
      }
      const result = id
        ? await marketplaceClient()
            .from('marketplace_offers')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', business.organization_id)
            .select('id')
            .single()
        : await marketplaceClient().from('marketplace_offers').insert(payload).select('id').single()
      if (result.error) throw result.error
      savedId = offerId
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10485760)
          throw new Error('Photos must be JPEG, PNG, or WebP and no larger than 10 MB.')
        const filePath = `${business.organization_id}/${offerId}/${crypto.randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'}`
        const upload = await marketplaceClient()
          .storage.from('marketplace-media')
          .upload(filePath, file, { contentType: file.type })
        if (upload.error) throw upload.error
        uploaded.push(filePath)
      }
      if (uploaded.length) {
        const result = await marketplaceClient()
          .from('marketplace_offers')
          .update({ images: [...(offer?.images ?? []), ...uploaded] })
          .eq('id', offerId)
        if (result.error) throw result.error
      }
      await cache.invalidateQueries({ queryKey: ['swahivo', 'provider-offers'] })
      void navigate(`${prefix}/listings`)
    } catch (ex) {
      if (uploaded.length)
        await marketplaceClient().storage.from('marketplace-media').remove(uploaded)
      setError(
        `${ex instanceof Error ? ex.message : 'Could not save listing.'}${savedId ? ' Your listing record is saved; you can retry its photos.' : ''}`,
      )
    } finally {
      setBusy(false)
    }
  }
  const field = (name: string, label: string, value: string | number, type = 'text') => (
    <div>
      <label htmlFor={`listing-${name}`}>{label}</label>
      <input
        className="sw-input"
        name={name}
        id={`listing-${name}`}
        type={type}
        defaultValue={value}
        min={type === 'number' ? 0 : undefined}
        required
      />
    </div>
  )
  return (
    <>
      <DashboardHeading
        title={id ? 'Edit Vehicle Listing' : 'Add a Vehicle Listing'}
        description="Only real vehicles and accurate prices. Publication requires administrator approval."
      />
      <form className="sw-panel sw-form-grid" onSubmit={(e) => void submit(e)} key={id ?? 'new'}>
        {service === 'rental' && (
          <div className="wide">
            <label htmlFor="rental-fleet-vehicle">Physical vehicle in your fleet</label>
            <select
              name="vehicle"
              id="rental-fleet-vehicle"
              className="sw-input"
              defaultValue={offer?.vehicle_id ?? ''}
              required
            >
              <option value="">Choose a fleet vehicle</option>
              {fleet.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.registration_plate}
                </option>
              ))}
            </select>
            {!fleet.data?.length && (
              <p className="sw-notice" style={{ marginTop: 10 }}>
                Add your physical fleet vehicle first.{' '}
                <Link className="sw-link" to="/rental/fleet/new">
                  Add a fleet vehicle
                </Link>
              </p>
            )}
          </div>
        )}
        <div className="wide">{field('title', 'Listing title', offer?.title ?? '')}</div>
        {field('make', 'Make', offer?.make ?? '')}
        {field('model', 'Model', offer?.model ?? '')}
        {field('year', 'Year', offer?.model_year ?? new Date().getFullYear(), 'number')}
        {field('mileage', 'Mileage (km)', offer?.mileage ?? 0, 'number')}
        <div>
          <label htmlFor="listing-condition">Condition</label>
          <select
            id="listing-condition"
            name="condition"
            className="sw-input"
            defaultValue={offer?.condition ?? 'used'}
          >
            <option value="used">Used</option>
            <option value="new">New</option>
          </select>
        </div>
        <div>
          <label htmlFor="listing-category">Category</label>
          <select
            id="listing-category"
            name="category"
            className="sw-input"
            defaultValue={offer?.category ?? 'Sedan'}
          >
            {['Economy', 'Sedan', 'SUV', 'Luxury', 'Van', '4x4', 'Electric', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        {field(
          'price',
          service === 'rental' ? 'Daily rental price (TZS)' : 'Sale price (TZS)',
          (offer?.price_minor ?? 0) / 100,
          'number',
        )}
        {field('location', 'Location / city', offer?.location ?? business.city)}
        <div>
          <label htmlFor="listing-transmission">Transmission</label>
          <select
            id="listing-transmission"
            name="transmission"
            className="sw-input"
            defaultValue={offer?.transmission ?? 'automatic'}
          >
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label htmlFor="listing-fuel">Fuel</label>
          <select
            id="listing-fuel"
            name="fuel"
            className="sw-input"
            defaultValue={offer?.fuel_type ?? 'petrol'}
          >
            {['petrol', 'diesel', 'hybrid', 'electric', 'other'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        {field('seats', 'Seats', offer?.seats ?? 5, 'number')}
        {service === 'rental' &&
          field('deposit', 'Refundable deposit (TZS)', (offer?.deposit_minor ?? 0) / 100, 'number')}
        {service === 'rental' && (
          <div className="wide flex gap-6">
            <label>
              <input type="checkbox" name="selfDrive" defaultChecked={offer?.self_drive ?? true} />{' '}
              Self-drive
            </label>
            <label>
              <input type="checkbox" name="chauffeur" defaultChecked={offer?.chauffeur ?? false} />{' '}
              Chauffeur available
            </label>
          </div>
        )}
        <div className="wide">
          <label htmlFor="listing-description">Vehicle description</label>
          <textarea
            className="sw-input"
            name="description"
            id="listing-description"
            rows={5}
            defaultValue={offer?.description ?? ''}
            maxLength={10000}
          />
        </div>
        {service === 'dealership' && (
          <div className="wide flex gap-6">
            <label>
              <input
                type="checkbox"
                name="testDrives"
                defaultChecked={offer?.test_drives_available ?? false}
              />
              Test drives offered for this vehicle
            </label>
            <label>
              <input
                type="checkbox"
                name="financing"
                defaultChecked={offer?.financing_available ?? false}
              />
              Financing enquiries accepted
            </label>
          </div>
        )}
        {service === 'rental' && (
          <div className="wide">
            <label htmlFor="rental-offer-terms">Agency rental terms</label>
            <textarea
              className="sw-input"
              id="rental-offer-terms"
              name="terms"
              rows={4}
              defaultValue={offer?.rental_terms ?? ''}
              placeholder="Enter your actual rental terms, document requirements, cancellation and deposit conditions."
            />
          </div>
        )}
        <div className="wide">
          <label htmlFor="listing-photos">Photos (JPEG, PNG, WebP · up to 10 MB each)</label>
          <input
            id="listing-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))}
            className="sw-input"
          />
          {!!offer?.images.length && (
            <p style={{ fontSize: 11, color: '#7c8ca2', marginTop: 6 }}>
              {offer.images.length} photos already saved.
            </p>
          )}
        </div>
        {error && (
          <p className="wide sw-notice" role="alert" style={{ color: '#c21b35' }}>
            {error}
          </p>
        )}
        <div className="wide flex flex-wrap gap-3">
          <button
            className="sw-button"
            disabled={busy}
            name="intent"
            value="pending"
            onClick={(e) => {
              const form = e.currentTarget.form
              if (form) {
                let input = form.querySelector<HTMLInputElement>('input[name=intent]')
                if (!input) {
                  input = document.createElement('input')
                  input.type = 'hidden'
                  input.name = 'intent'
                  form.appendChild(input)
                }
                input.value = 'pending'
              }
            }}
          >
            <Upload size={16} />
            {busy ? 'Saving…' : 'Submit for Approval'}
          </button>
          <button
            className="sw-button secondary"
            disabled={busy}
            type="submit"
            onClick={(e) => {
              const form = e.currentTarget.form
              if (form) {
                let input = form.querySelector<HTMLInputElement>('input[name=intent]')
                if (!input) {
                  input = document.createElement('input')
                  input.type = 'hidden'
                  input.name = 'intent'
                  form.appendChild(input)
                }
                input.value = 'draft'
              }
            }}
          >
            <Save size={16} />
            Save Draft
          </button>
        </div>
      </form>
    </>
  )
}

export function ProviderEnquiries({ service }: { service: ServiceType }) {
  const business = useMarketBusiness()
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['swahivo', 'enquiries', business.organization_id, service],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_enquiries')
        .select('*')
        .eq('organization_id', business.organization_id)
        .eq('service', service)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  async function update(id: string, status: string) {
    const r = await marketplaceClient()
      .from('marketplace_enquiries')
      .update({ status })
      .eq('id', id)
    if (r.error) setError(r.error.message)
    else await query.refetch()
  }
  return (
    <>
      <DashboardHeading
        title="Customer Enquiries"
        description="Real customer messages and your follow-up status."
      />
      {error && (
        <p className="sw-notice" role="alert">
          {error}
        </p>
      )}
      <div className="sw-panel" style={{ overflowX: 'auto' }}>
        {query.error ? (
          <p role="alert">{query.error.message}</p>
        ) : query.data?.length ? (
          <table className="sw-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Message</th>
                <th>Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.customer_name}
                    <br />
                    <a className="sw-link" href={`mailto:${e.contact_email}`}>
                      {e.contact_email}
                    </a>
                  </td>
                  <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap' }}>{e.message}</td>
                  <td>{new Date(e.created_at).toLocaleDateString()}</td>
                  <td>
                    <select
                      className="sw-input"
                      value={e.status}
                      onChange={(event) => void update(e.id, event.target.value)}
                    >
                      {[
                        'new',
                        'contacted',
                        'interested',
                        'negotiation',
                        'test_drive',
                        'won',
                        'lost',
                        'closed',
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyMarketplace title="No enquiries yet">
            Messages sent from your published vehicle pages appear here.
          </EmptyMarketplace>
        )}
      </div>
    </>
  )
}

export function CRMPage({ service, admin = false }: { service?: ServiceType; admin?: boolean }) {
  const scopedBusiness = useOptionalMarketBusiness()
  const business = admin ? null : scopedBusiness
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [creating, setCreating] = useState(false)
  const team = useQuery({
    queryKey: ['swahivo', 'crm-team', business?.organization_id],
    enabled: !!business && !admin,
    queryFn: () => fetchTeamMembers(business!.organization_id),
  })
  const tasks = useQuery({
    queryKey: ['swahivo', 'crm-tasks', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const result = await marketplaceClient()
        .from('crm_tasks')
        .select('*')
        .eq('lead_id', selected!.id)
        .order('due_at')
      if (result.error) throw result.error
      return result.data ?? []
    },
  })
  async function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const result = await marketplaceClient()
      .from('crm_tasks')
      .insert({
        organization_id: selected!.organization_id,
        lead_id: selected!.id,
        title: fieldText(data.get('title')),
        due_at: new Date(fieldText(data.get('due'))).toISOString(),
      })
    if (result.error) setError(result.error.message)
    else {
      form.reset()
      await tasks.refetch()
    }
  }
  async function completeTask(id: string, completed: boolean) {
    const result = await marketplaceClient().from('crm_tasks').update({ completed }).eq('id', id)
    if (result.error) setError(result.error.message)
    else await tasks.refetch()
  }
  const query = useQuery({
    queryKey: ['swahivo', 'crm', business?.organization_id, service, admin],
    queryFn: async () => {
      let q = marketplaceClient()
        .from('crm_leads')
        .select('*')
        .order('created_at', { ascending: false })
      if (business) q = q.eq('organization_id', business.organization_id)
      if (service) q = q.eq('service', service)
      const r = await q
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const activities = useQuery({
    queryKey: ['swahivo', 'activities', selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('crm_activities')
        .select('*')
        .eq('lead_id', selected!.id)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    const row = {
      name: fieldText(data.get('name')),
      email: fieldText(data.get('email')) || null,
      phone: fieldText(data.get('phone')) || null,
      stage: fieldText(data.get('stage')),
      assigned_to: data.has('assigned_to')
        ? fieldText(data.get('assigned_to')) || null
        : (selected?.assigned_to ?? null),
      notes: fieldText(data.get('notes')) || null,
      follow_up_at: data.get('followup')
        ? new Date(fieldText(data.get('followup'))).toISOString()
        : null,
    }
    const r = selected
      ? await marketplaceClient().from('crm_leads').update(row).eq('id', selected.id)
      : await marketplaceClient()
          .from('crm_leads')
          .insert({
            ...row,
            organization_id: business!.organization_id,
            service: service!,
            source: 'manual',
          })
    if (r.error) {
      setError(r.error.message)
      return
    }
    setSelected(null)
    setCreating(false)
    await query.refetch()
  }
  async function addNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(e.currentTarget)
    const r = await marketplaceClient()
      .from('crm_activities')
      .insert({
        organization_id: selected!.organization_id,
        lead_id: selected!.id,
        note: fieldText(data.get('note')),
      })
    if (r.error) setError(r.error.message)
    else {
      await activities.refetch()
      form.reset()
    }
  }
  const stages =
    service === 'rental'
      ? [
          'new',
          'quotation',
          'reservation',
          'confirmed',
          'pickup',
          'active',
          'returned',
          'completed',
        ]
      : ['new', 'contacted', 'interested', 'negotiation', 'test_drive', 'won', 'lost']
  function exportCsv() {
    const header = ['Name', 'Email', 'Phone', 'Stage', 'Source', 'Follow up']
    const rows = (query.data ?? []).map((r) => [
      r.name,
      r.email ?? '',
      r.phone ?? '',
      r.stage,
      r.source,
      r.follow_up_at ?? '',
    ])
    const escape = (v: string) => `"${(/^[=+@-]/.test(v) ? `'${v}` : v).replaceAll('"', '""')}"`
    const blob = new Blob([[header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'swahivo-crm.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <DashboardHeading
        title={admin ? 'Platform CRM' : 'Customers & CRM'}
        description={
          admin
            ? 'Authorized oversight of provider lead records.'
            : 'Track contacts, opportunities, conversations, and follow-ups.'
        }
        action={
          <div className="flex gap-3">
            <button className="sw-button secondary" onClick={exportCsv}>
              Export CSV
            </button>
            {!admin && (
              <button
                className="sw-button"
                onClick={() => {
                  setSelected(null)
                  setCreating(true)
                }}
              >
                <Plus size={16} />
                Add Contact
              </button>
            )}
          </div>
        }
      />
      {error && (
        <p className="sw-notice" role="alert">
          {error}
        </p>
      )}
      {(selected || creating) && !admin && (
        <section className="sw-panel" style={{ marginBottom: 24 }}>
          <h2>{selected ? 'Edit Contact' : 'New Contact'}</h2>
          <form className="sw-form-grid" onSubmit={(e) => void save(e)} key={selected?.id ?? 'new'}>
            {[
              ['name', 'Name', selected?.name ?? ''],
              ['email', 'Email', selected?.email ?? ''],
              ['phone', 'Phone', selected?.phone ?? ''],
            ].map(([name, label, value]) => (
              <div key={name}>
                <label htmlFor={`crm-${name}`}>{label}</label>
                <input
                  className="sw-input"
                  id={`crm-${name}`}
                  name={name}
                  defaultValue={value}
                  required={name === 'name'}
                />
              </div>
            ))}
            <div>
              <label htmlFor="crm-stage">Stage</label>
              <select
                id="crm-stage"
                name="stage"
                className="sw-input"
                defaultValue={selected?.stage ?? 'new'}
              >
                {stages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="crm-followup">Follow-up</label>
              <input
                className="sw-input"
                id="crm-followup"
                name="followup"
                type="datetime-local"
                defaultValue={selected?.follow_up_at ? selected.follow_up_at.slice(0, 16) : ''}
              />
            </div>
            <div>
              <label htmlFor="crm-assignee">Assigned team member</label>
              <select
                className="sw-input"
                id="crm-assignee"
                name="assigned_to"
                defaultValue={selected?.assigned_to ?? ''}
                disabled={team.isPending || !!team.error}
              >
                <option value="">Unassigned</option>
                {team.data?.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name} · {member.role}
                  </option>
                ))}
              </select>
              {team.error && <p role="alert">{team.error.message}</p>}
            </div>
            <div className="wide">
              <label htmlFor="crm-notes">Notes</label>
              <textarea
                className="sw-input"
                id="crm-notes"
                name="notes"
                defaultValue={selected?.notes ?? ''}
                rows={3}
              />
            </div>
            <div className="wide flex gap-3">
              <button className="sw-button">Save Contact</button>
              <button
                className="sw-button secondary"
                type="button"
                onClick={() => {
                  setSelected(null)
                  setCreating(false)
                }}
              >
                Close
              </button>
            </div>
          </form>
          {selected && (
            <div style={{ marginTop: 25 }}>
              <h2>Interaction History</h2>
              {activities.error && <p role="alert">{activities.error.message}</p>}
              {activities.data?.map((a) => (
                <p
                  key={a.id}
                  style={{ padding: '10px 0', borderBottom: '1px solid #e5ebf3', fontSize: 12 }}
                >
                  {a.note}
                  <span style={{ display: 'block', color: '#8592a5', fontSize: 10 }}>
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </p>
              ))}
              <form
                onSubmit={(e) => void addNote(e)}
                className="flex gap-3"
                style={{ marginTop: 12 }}
              >
                <input
                  className="sw-input"
                  name="note"
                  aria-label="Interaction note"
                  placeholder="Record a customer interaction"
                  required
                />
                <button className="sw-button">Add Note</button>
              </form>
              <h2 style={{ marginTop: 24 }}>Follow-up Tasks</h2>
              {tasks.error && <p role="alert">{tasks.error.message}</p>}
              {tasks.data?.map((task) => (
                <label
                  key={task.id}
                  className="flex items-center gap-3"
                  style={{ padding: '10px 0' }}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) => void completeTask(task.id, e.target.checked)}
                  />
                  <span style={{ textDecoration: task.completed ? 'line-through' : undefined }}>
                    {task.title} · {new Date(task.due_at).toLocaleString()}
                  </span>
                </label>
              ))}
              <form className="sw-form-grid" onSubmit={(e) => void addTask(e)}>
                <div>
                  <label htmlFor="crm-task-title">Task</label>
                  <input
                    className="sw-input"
                    id="crm-task-title"
                    name="title"
                    required
                    maxLength={200}
                  />
                </div>
                <div>
                  <label htmlFor="crm-task-due">Due date</label>
                  <input
                    className="sw-input"
                    id="crm-task-due"
                    name="due"
                    type="datetime-local"
                    required
                  />
                </div>
                <button className="sw-button" type="submit">
                  Add Task
                </button>
              </form>
            </div>
          )}
        </section>
      )}
      <div className="sw-panel" style={{ overflowX: 'auto' }}>
        {query.error ? (
          <p role="alert">{query.error.message}</p>
        ) : query.data?.length ? (
          <table className="sw-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Service</th>
                <th>Stage</th>
                <th>Source</th>
                <th>Follow-up</th>
                {!admin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {query.data.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    {lead.name}
                    <br />
                    <span style={{ color: '#8190a4' }}>{lead.email ?? lead.phone}</span>
                  </td>
                  <td>{lead.service}</td>
                  <td>
                    <span className="sw-status">{lead.stage}</span>
                  </td>
                  <td>{lead.source}</td>
                  <td>{lead.follow_up_at ? new Date(lead.follow_up_at).toLocaleString() : '—'}</td>
                  {!admin && (
                    <td>
                      <button
                        className="sw-link"
                        onClick={() => {
                          setSelected(lead)
                          setCreating(false)
                        }}
                      >
                        Open
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyMarketplace title="No contacts yet">
            Create contacts here, or receive real customer enquiries from your published listings.
          </EmptyMarketplace>
        )}
      </div>
    </>
  )
}

export function BusinessSettings() {
  const business = useMarketBusiness()
  const cache = useQueryClient()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    const data = new FormData(e.currentTarget)
    const number = fieldText(data.get('whatsapp'))
    const normalized = number ? normalizePhone(number) : null
    if (number && !normalized) {
      setError('Enter a valid international WhatsApp number.')
      return
    }
    const row = {
      name: fieldText(data.get('name')),
      city: fieldText(data.get('city')),
      region: fieldText(data.get('region')),
      address: fieldText(data.get('address')),
      description: fieldText(data.get('description')),
      business_phone: fieldText(data.get('phone')) || null,
      whatsapp_number_e164: normalized,
      whatsapp_enabled: data.get('enabled') === 'on',
    }
    const r = await marketplaceClient()
      .from('marketplace_businesses')
      .update(row)
      .eq('organization_id', business.organization_id)
    if (r.error) {
      setError(r.error.message)
      return
    }
    try {
      for (const field of ['logo', 'banner']) {
        const file = data.get(field)
        if (file instanceof File && file.size) {
          if (
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            file.size > 10485760
          )
            throw new Error('Images must be JPEG, PNG, or WebP under 10 MB.')
          const objectPath = `${business.organization_id}/profile/${field}-${crypto.randomUUID()}`
          const upload = await marketplaceClient()
            .storage.from('marketplace-media')
            .upload(objectPath, file, { contentType: file.type })
          if (upload.error) throw upload.error
          const update = await marketplaceClient()
            .from('marketplace_businesses')
            .update(field === 'logo' ? { logo_path: objectPath } : { banner_path: objectPath })
            .eq('organization_id', business.organization_id)
          if (update.error) throw update.error
        }
      }
      await cache.invalidateQueries({ queryKey: ['swahivo', 'account'] })
      setSuccess(true)
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Image upload failed.')
    }
  }
  return (
    <>
      <DashboardHeading
        title="Business Profile & Contact"
        description="Your provider identity and direct contact destinations."
      />
      <form className="sw-panel sw-form-grid" onSubmit={(e) => void save(e)}>
        {[
          ['name', 'Business name', business.name],
          ['phone', 'Business phone', business.business_phone ?? ''],
          ['city', 'City', business.city],
          ['region', 'Region', business.region],
          [
            'address',
            'Business address',
            (business as unknown as { address?: string }).address ?? '',
          ],
          ['whatsapp', 'WhatsApp number', business.whatsapp_number_e164 ?? ''],
        ].map(([name, label, value]) => (
          <div key={name}>
            <label htmlFor={`business-${name}`}>{label}</label>
            <input className="sw-input" id={`business-${name}`} name={name} defaultValue={value} />
          </div>
        ))}
        <label className="wide flex gap-3">
          <input type="checkbox" name="enabled" defaultChecked={business.whatsapp_enabled} />
          Enable direct WhatsApp contact on my public listings
        </label>
        <div className="wide">
          <label htmlFor="business-description">Business description</label>
          <textarea
            className="sw-input"
            id="business-description"
            name="description"
            defaultValue={business.description}
            rows={4}
          />
        </div>
        {['logo', 'banner'].map((field) => (
          <div key={field}>
            <label htmlFor={`business-${field}`}>Business {field}</label>
            <input
              className="sw-input"
              id={`business-${field}`}
              name={field}
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </div>
        ))}
        {error && (
          <p className="wide sw-notice" role="alert" style={{ color: '#c11' }}>
            {error}
          </p>
        )}
        {success && (
          <p className="wide sw-notice" role="status">
            Business profile saved to Supabase.
          </p>
        )}
        <button className="sw-button wide">
          <Save size={16} />
          Save Business Profile
        </button>
      </form>
      <ServiceApplication />
    </>
  )
}

export function BookingRequests() {
  const business = useMarketBusiness()
  const [error, setError] = useState('')
  const query = useQuery({
    queryKey: ['swahivo', 'requests', business.organization_id],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_reservations')
        .select('*')
        .eq('organization_id', business.organization_id)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  async function decide(id: string, confirm: boolean) {
    setError('')
    try {
      await rpc('marketplace_decide_booking', { p_reservation_id: id, p_confirm: confirm })
      await query.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not update reservation.')
    }
  }
  return (
    <>
      <DashboardHeading
        title="Rental Booking Requests"
        description="Confirming a request reserves the physical vehicle through the existing rental engine."
      />
      {error && (
        <p role="alert" className="sw-notice" style={{ color: '#c21' }}>
          {error}
        </p>
      )}
      <div className="sw-panel" style={{ overflowX: 'auto' }}>
        {query.error ? (
          <p role="alert">{query.error.message}</p>
        ) : query.data?.length ? (
          <table className="sw-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Period</th>
                <th>Price</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.driver_name}</td>
                  <td>
                    {new Date(b.starts_at).toLocaleString()}
                    <br />
                    {new Date(b.ends_at).toLocaleString()}
                  </td>
                  <td>{money(b.total_minor, b.currency)}</td>
                  <td>
                    <span className="sw-status">{b.status}</span>
                  </td>
                  <td>
                    {b.status === 'requested' ? (
                      <div className="flex gap-2">
                        <button className="sw-button" onClick={() => void decide(b.id, true)}>
                          Confirm
                        </button>
                        <button
                          className="sw-button secondary"
                          onClick={() => void decide(b.id, false)}
                        >
                          Decline
                        </button>
                      </div>
                    ) : b.rental_id ? (
                      <Link className="sw-link" to={`/rental/reservations/${b.rental_id}`}>
                        Open Rental Contract
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyMarketplace title="No booking requests yet">
            Customers can request dates from your published rental listings.
          </EmptyMarketplace>
        )}
      </div>
    </>
  )
}

export function SubscriptionPage() {
  const business = useMarketBusiness()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const packages = useQuery({
    queryKey: ['swahivo', 'provider-packages'],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('service_packages')
        .select('*')
        .eq('published', true)
        .order('monthly_tzs')
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const subscription = useQuery({
    queryKey: ['swahivo', 'subscriptions', business.organization_id],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_subscriptions')
        .select('*')
        .eq('organization_id', business.organization_id)
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  async function checkout(id: string) {
    setError('')
    setBusy(id)
    try {
      const result = await marketplaceClient().functions.invoke('swahivo-billing', {
        body: { organization_id: business.organization_id, package_id: id },
      })
      if (result.error) {
        let message = result.error instanceof Error ? result.error.message : 'Checkout failed.'
        const context = (result.error as { context?: Response }).context
        if (context) {
          const body = (await context.clone().json()) as { error?: string }
          message = body.error ?? message
        }
        throw new Error(message)
      }
      const body = result.data as { url?: unknown } | null
      const url = fieldText(body?.url)
      if (new URL(url).hostname !== 'checkout.stripe.com')
        throw new Error('Checkout did not return a trusted payment URL.')
      window.location.assign(url)
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not start checkout.')
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <DashboardHeading
        title="Business Subscription"
        description="Separate entitlements for dealership listings and rental operations."
      />
      <div className="sw-panel">
        {error && (
          <p className="sw-notice" role="alert" style={{ marginBottom: 20, color: '#c21b35' }}>
            {error}
          </p>
        )}
        <h2>{business.name}</h2>
        <p className="sw-notice">
          Your enabled services: {business.services.join(' & ')}. Dealership listing allowances are
          enforced on the server. Rental fleet limits are managed separately.
        </p>
        <Link className="sw-button" style={{ marginTop: 20 }} to="/pricing">
          View Published Packages <ArrowRight size={15} />
        </Link>
        <p style={{ fontSize: 12, color: '#70829b', marginTop: 18 }}>
          Payment checkout is available only when a real payment provider and package price are
          configured. No payment or paid activation is simulated.
        </p>
        {subscription.error && <p role="alert">{subscription.error.message}</p>}
        {subscription.data?.map((s) => (
          <p className="sw-notice" key={s.service} style={{ marginTop: 15 }}>
            {s.service}: {s.status} · {s.provider}
            {s.expires_at ? ` · Ends ${new Date(s.expires_at).toLocaleDateString()}` : ''}
          </p>
        ))}
      </div>
      <div className="sw-pricing" style={{ marginTop: 24 }}>
        {packages.data
          ?.filter((p) => business.services.includes(p.service))
          .map((p) => (
            <article className="sw-plan" key={p.id}>
              <span className="sw-status">{p.service}</span>
              <h3 style={{ marginTop: 15 }}>{p.name}</h3>
              <p className="sw-price">
                {p.monthly_tzs === null ? 'Not published' : `${p.monthly_tzs.toLocaleString()} TZS`}
                <small> / month</small>
              </p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {p.monthly_tzs === 0 ? (
                <p className="sw-notice">Free allowance is included after business approval.</p>
              ) : (
                <button
                  className="sw-button"
                  disabled={!p.stripe_price_id || busy === p.id}
                  onClick={() => void checkout(p.id)}
                >
                  {!p.stripe_price_id
                    ? 'Payment setup required'
                    : busy === p.id
                      ? 'Opening Stripe…'
                      : 'Continue to Secure Checkout'}
                </button>
              )}
            </article>
          ))}
      </div>
      <ServiceApplication />
    </>
  )
}

export function ServiceApplication() {
  const business = useMarketBusiness()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const missing = business.services.includes('dealership') ? 'rental' : 'dealership'
  if (business.services.length === 2) return null
  return (
    <section className="sw-panel" style={{ marginTop: 24 }}>
      <h2>Grow into both services</h2>
      <p style={{ fontSize: 12, color: '#73849d', marginBottom: 18 }}>
        Keep one business and one team. Request access to{' '}
        {missing === 'rental' ? 'Car Rental' : 'Car Dealership'}.
      </p>
      <button
        className="sw-button secondary"
        disabled={!!message}
        onClick={() => {
          setError('')
          void rpc('marketplace_request_services', {
            p_organization_id: business.organization_id,
            p_services: [missing],
          })
            .then(() =>
              setMessage('Your service request was saved and is awaiting platform approval.'),
            )
            .catch((ex: Error) => setError(ex.message))
        }}
      >
        Request {missing === 'rental' ? 'Rental' : 'Dealership'} Service
      </button>
      {error && (
        <p role="alert" className="sw-notice" style={{ marginTop: 12, color: '#c21' }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="sw-notice" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
    </section>
  )
}
