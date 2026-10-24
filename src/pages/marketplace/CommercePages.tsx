import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import {
  marketplaceClient,
  rpc,
  money,
  fieldText,
  useMarketplaceAccount,
  startCommerceCheckout,
  type AdPlacement,
  type CampaignStat,
  type Campaign,
  type PaymentOrder,
  type ServiceType,
} from '@/features/marketplace/api'
import { DashboardHeading, useOptionalMarketBusiness } from './DashboardShell'
import { EmptyMarketplace } from './MarketplacePage'

export function ProviderOnboarding() {
  const account = useMarketplaceAccount()
  const { user } = useAuth()
  const cache = useQueryClient()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState('')
  const applications = account.data?.applications.filter((a) => a.status === 'pending') ?? []
  const query = useQuery({
    queryKey: ['swahivo', 'onboarding', user?.id],
    queryFn: async () => {
      const [plans, selections, payments] = await Promise.all([
        marketplaceClient()
          .from('service_packages')
          .select('*')
          .eq('published', true)
          .order('monthly_tzs'),
        marketplaceClient().from('marketplace_plan_selections').select('*'),
        marketplaceClient().from('marketplace_payment_orders').select('*').eq('user_id', user!.id),
      ])
      if (plans.error || selections.error || payments.error)
        throw plans.error ?? selections.error ?? payments.error
      return {
        plans: plans.data ?? [],
        selections: selections.data ?? [],
        payments: payments.data ?? [],
      }
    },
  })
  async function choose(application: string, plan: string) {
    setBusy(plan)
    setError('')
    try {
      await rpc('marketplace_select_plan', { p_application_id: application, p_package_id: plan })
      await cache.invalidateQueries({ queryKey: ['swahivo'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not choose plan.')
    } finally {
      setBusy('')
    }
  }
  async function pay(id: string) {
    setBusy(id)
    setError('')
    try {
      await startCommerceCheckout(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment is unavailable.')
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <DashboardHeading
        title="Choose your business plan"
        description="Choose a plan for each requested service. Paid accounts stay on hold until payment is received and Swahivo approves the business. Buyer accounts do not require a business plan."
      />
      {(error || query.error) && (
        <p className="sw-notice" role="alert">
          {error || query.error?.message}
        </p>
      )}
      {applications.map((a) => (
        <section key={a.id} className="sw-panel" style={{ marginBottom: 24 }}>
          <h2>{a.business_name}</h2>
          {a.requested_services.map((service) => {
            const selected = query.data?.selections.find(
              (s) => s.application_id === a.id && s.service === service,
            )
            const payment = query.data?.payments.find(
              (p) => p.selection_id === selected?.id && p.status === 'pending',
            )
            const plans =
              query.data?.plans.filter((p) => p.service === service && p.monthly_tzs !== null) ?? []
            return (
              <div key={service} style={{ marginTop: 24 }}>
                <h3>{service === 'rental' ? 'Car Rental' : 'Car Dealership'}</h3>
                {selected && (
                  <p className="sw-notice" style={{ marginBlock: 15 }}>
                    {selected.status === 'awaiting_payment'
                      ? 'Account on hold — awaiting payment.'
                      : selected.status === 'paid'
                        ? 'Payment received — awaiting administrator approval.'
                        : 'Free plan selected — awaiting administrator approval.'}{' '}
                    {payment && (
                      <button
                        className="sw-button"
                        disabled={!!busy}
                        onClick={() => void pay(payment.id)}
                      >
                        Pay {money(payment.amount_minor, 'TZS')}
                      </button>
                    )}
                  </p>
                )}
                <div className="sw-pricing">
                  {plans.map((p) => (
                    <article className="sw-panel" key={p.id}>
                      <h3>{p.name}</h3>
                      <h2 style={{ marginBlock: 16 }}>
                        {money((p.monthly_tzs ?? 0) * 100, 'TZS')}
                        <small style={{ fontSize: 12 }}> / month</small>
                      </h2>
                      <p>
                        {p.listing_limit ?? 'Unlimited'} listings · {p.included_ad_days} included ad
                        days/month
                      </p>
                      <button
                        className="sw-button"
                        style={{ marginTop: 20 }}
                        disabled={
                          !!busy || selected?.status === 'paid' || selected?.package_id === p.id
                        }
                        onClick={() => void choose(a.id, p.id)}
                      >
                        {selected?.package_id === p.id ? 'Selected' : 'Choose Plan'}
                      </button>
                    </article>
                  ))}
                </div>
                {!plans.length && (
                  <p className="sw-notice">
                    Swahivo is configuring plans for this service. Your application remains on hold;
                    contact support for availability.
                  </p>
                )}
              </div>
            )
          })}
        </section>
      ))}
      {!applications.length && !account.isPending && (
        <EmptyMarketplace title="No pending business application">
          <Link className="sw-link" to="/dashboard">
            Open your dashboard
          </Link>
        </EmptyMarketplace>
      )}
      <p className="sw-notice">
        Initial paid activation covers the first 30 days after approval. Renewals and upgrades are
        managed from your business subscription page.
      </p>
      <Link className="sw-link" to="/customer/support">
        Contact Swahivo support →
      </Link>
    </>
  )
}

export function MarketingPage({
  admin = false,
  service = 'dealership',
}: {
  admin?: boolean
  service?: ServiceType
}) {
  const business = useOptionalMarketBusiness(),
    { user } = useAuth(),
    cache = useQueryClient()
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false)
  const [placement, setPlacement] = useState(''),
    [receipt, setReceipt] = useState<PaymentOrder | null>(null)
  const [creatingPlacement, setCreatingPlacement] = useState(false)
  const query = useQuery({
    queryKey: ['swahivo', 'marketing', admin, business?.organization_id, service, user?.id],
    queryFn: async () => {
      let campaigns = marketplaceClient()
        .from('marketplace_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
      let payments = marketplaceClient()
        .from('marketplace_payment_orders')
        .select('*')
        .order('created_at', { ascending: false })
      if (!admin) {
        campaigns = campaigns
          .eq('organization_id', business!.organization_id)
          .eq('service', service)
        payments = payments.eq('user_id', user!.id)
      }
      const [p, c, plans, orders, stats] = await Promise.all([
        marketplaceClient().from('marketplace_ad_placements').select('*').order('name'),
        campaigns,
        marketplaceClient().from('service_packages').select('*').order('monthly_tzs'),
        payments,
        rpc<CampaignStat[]>('marketplace_campaign_stats', {
          p_org: admin ? null : business!.organization_id,
        }),
      ])
      if (p.error || c.error || plans.error || orders.error)
        throw p.error ?? c.error ?? plans.error ?? orders.error
      return {
        placements: p.data ?? [],
        campaigns: c.data ?? [],
        plans: plans.data ?? [],
        payments: orders.data ?? [],
        stats,
      }
    },
  })
  const offers = useQuery({
    queryKey: ['swahivo', 'advertisable-offers', business?.organization_id, service],
    enabled: !admin && !!business,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_offers')
        .select('*')
        .eq('organization_id', business!.organization_id)
        .eq('service', service)
        .eq('status', 'published')
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const subscription = useQuery({
    queryKey: ['swahivo', 'ad-subscription', business?.organization_id, service],
    enabled: !admin && !!business,
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_subscriptions')
        .select('*')
        .eq('organization_id', business!.organization_id)
        .eq('service', service)
        .maybeSingle()
      if (r.error) throw r.error
      return r.data
    },
  })
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await cache.invalidateQueries({ queryKey: ['swahivo'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The request could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  async function savePlacement(e: FormEvent<HTMLFormElement>, p: AdPlacement) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    await run(() =>
      rpc('marketplace_admin_marketing', {
        p_action: 'placement',
        p_data: {
          id: p.id,
          price_daily_minor: fieldText(d.get('price'))
            ? Math.round(Number(d.get('price')) * 100)
            : null,
          max_days: Number(d.get('max')),
          enabled: d.get('enabled') === 'on',
          allow_plan_credit: d.get('credit') === 'on',
        },
      }),
    )
  }
  async function createPlacement(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    await run(() =>
      rpc('marketplace_provider_create_placement', {
        p_org: business!.organization_id,
        p_id: fieldText(d.get('id')),
        p_name: fieldText(d.get('name')),
        p_description: fieldText(d.get('description')),
        p_price_daily_minor: fieldText(d.get('price'))
          ? Math.round(Number(d.get('price')) * 100)
          : null,
        p_max_days: Number(d.get('max')),
        p_enabled: d.get('enabled') === 'on',
        p_allow_plan_credit: d.get('credit') === 'on',
      }),
    )
    setCreatingPlacement(false)
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const d = new FormData(e.currentTarget)
    await run(async () => {
      let image: string | null = null
      const file = d.get('image')
      if (file instanceof File && file.size) {
        if (
          file.size > 10 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        )
          throw new Error('Use a JPG, PNG or WebP image under 10 MB.')
        image = `${business!.organization_id}/${crypto.randomUUID()}.${file.type.split('/')[1]}`
        const u = await marketplaceClient()
          .storage.from('marketplace-ads')
          .upload(image, file, { contentType: file.type })
        if (u.error) throw u.error
      }
      try {
        await rpc('marketplace_create_campaign', {
          p_org: business!.organization_id,
          p_service: service,
          p_placement: fieldText(d.get('placement')),
          p_offer: fieldText(d.get('offer')) || null,
          p_title: fieldText(d.get('title')),
          p_description: fieldText(d.get('description')),
          p_image: image,
          p_from: new Date(fieldText(d.get('from'))).toISOString(),
          p_to: new Date(fieldText(d.get('to'))).toISOString(),
          p_use_credit: d.get('credit') === 'on',
        })
        setCreating(false)
      } catch (ex) {
        if (image) await marketplaceClient().storage.from('marketplace-ads').remove([image])
        throw ex
      }
    })
  }
  const activePlan = query.data?.plans.find((p) => p.id === subscription.data?.package_id)
  return (
    <>
      <DashboardHeading
        title={admin ? 'Marketing & Advertising' : 'Promote / Boost'}
        description={
          admin
            ? 'Manage placement prices, included plan allowances, payments and campaign approval across both services.'
            : 'Reach buyers across Swahivo. Choose a placement, schedule your campaign and submit it for platform approval.'
        }
        action={
          !admin ? (
            <button className="sw-button" onClick={() => setCreating(!creating)}>
              Create Campaign +
            </button>
          ) : undefined
        }
      />
      {(error || query.error || offers.error || subscription.error) && (
        <p className="sw-notice" role="alert">
          {error || query.error?.message || offers.error?.message || subscription.error?.message}
        </p>
      )}
      {!admin && (
        <p className="sw-notice">
          {activePlan
            ? `${activePlan.name}: ${activePlan.included_ad_days} included advertising days per calendar month.`
            : 'No included plan allowance is active.'}{' '}
          Included days are reserved when a campaign is submitted and released if it is rejected.
          Every campaign requires admin approval.
        </p>
      )}
      {admin && (
        <>
          <section className="sw-panel" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2>Placement Prices</h2>
              <button className="sw-button secondary" onClick={() => setCreatingPlacement(!creatingPlacement)}>
                {creatingPlacement ? 'Cancel' : 'Create New Placement'}
              </button>
            </div>
            {creatingPlacement && (
              <form className="sw-panel sw-form-grid" style={{ marginBottom: 24 }} onSubmit={(e) => void createPlacement(e)}>
                <div>
                  <label>
                    Placement ID
                    <input name="id" className="sw-input" required minLength={3} maxLength={50} placeholder="e.g., home_banner" />
                  </label>
                </div>
                <div>
                  <label>
                    Name
                    <input name="name" className="sw-input" required minLength={3} maxLength={100} placeholder="e.g., Homepage Banner" />
                  </label>
                </div>
                <div className="wide">
                  <label>
                    Description
                    <input name="description" className="sw-input" required minLength={10} maxLength={500} placeholder="Describe where this placement appears" />
                  </label>
                </div>
                <div>
                  <label>
                    Price per day (TZS)
                    <input name="price" type="number" min="1" className="sw-input" placeholder="Leave empty for plan credit only" />
                  </label>
                </div>
                <div>
                  <label>
                    Maximum days
                    <input name="max" type="number" min="1" max="90" className="sw-input" defaultValue={30} required />
                  </label>
                </div>
                <label className="flex gap-2">
                  <input name="enabled" type="checkbox" defaultChecked={true} />
                  Available to providers
                </label>
                <label className="flex gap-2">
                  <input name="credit" type="checkbox" defaultChecked={true} />
                  Allow included plan days
                </label>
                <button disabled={busy} className="sw-button">
                  Create Placement
                </button>
              </form>
            )}
            <div className="sw-pricing">
              {query.data?.placements.map((p) => (
                <form key={p.id} className="sw-panel" onSubmit={(e) => void savePlacement(e, p)}>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <label>
                    Price per day (TZS)
                    <input
                      name="price"
                      type="number"
                      min="1"
                      className="sw-input"
                      defaultValue={p.price_daily_minor === null ? '' : p.price_daily_minor / 100}
                    />
                  </label>
                  <label>
                    Maximum days
                    <input
                      name="max"
                      type="number"
                      min="1"
                      max="90"
                      className="sw-input"
                      defaultValue={p.max_days}
                      required
                    />
                  </label>
                  <label className="flex gap-2">
                    <input name="enabled" type="checkbox" defaultChecked={p.enabled} />
                    Available to providers
                  </label>
                  <label className="flex gap-2">
                    <input name="credit" type="checkbox" defaultChecked={p.allow_plan_credit} />
                    Allow included plan days
                  </label>
                  <button disabled={busy} className="sw-button">
                    Save Placement
                  </button>
                </form>
              ))}
            </div>
          </section>
          <section className="sw-panel" style={{ marginBottom: 24 }}>
            <h2>Plan Advertising Allowances</h2>
            <p>
              Set higher plans to include ad days at no additional charge. Zero means paid
              advertising only.
            </p>
            <div className="sw-pricing">
              {query.data?.plans.map((p) => (
                <form
                  className="sw-panel"
                  key={p.id}
                  onSubmit={(e) => {
                    e.preventDefault()
                    const d = new FormData(e.currentTarget)
                    void run(() =>
                      rpc('marketplace_admin_marketing', {
                        p_action: 'allowance',
                        p_data: { id: p.id, included_ad_days: Number(d.get('days')) },
                      }),
                    )
                  }}
                >
                  <h3>
                    {p.name} · {p.service}
                  </h3>
                  <label>
                    Included days / month
                    <input
                      className="sw-input"
                      name="days"
                      type="number"
                      min="0"
                      max="365"
                      required
                      defaultValue={p.included_ad_days}
                    />
                  </label>
                  <button className="sw-button secondary" disabled={busy}>
                    Save Allowance
                  </button>
                </form>
              ))}
            </div>
          </section>
        </>
      )}
      {!admin && (
        <section className="sw-panel" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2>My Custom Placements</h2>
            <button className="sw-button secondary" onClick={() => setCreatingPlacement(!creatingPlacement)}>
              {creatingPlacement ? 'Cancel' : 'Create Custom Placement'}
            </button>
          </div>
          {creatingPlacement && (
            <form className="sw-panel sw-form-grid" style={{ marginBottom: 24 }} onSubmit={(e) => void createPlacement(e)}>
              <div>
                <label>
                  Placement ID
                  <input name="id" className="sw-input" required minLength={3} maxLength={50} placeholder="e.g., my_banner" />
                </label>
              </div>
              <div>
                <label>
                  Name
                  <input name="name" className="sw-input" required minLength={3} maxLength={100} placeholder="e.g., My Custom Banner" />
                </label>
              </div>
              <div className="wide">
                <label>
                  Description
                  <input name="description" className="sw-input" required minLength={10} maxLength={500} placeholder="Describe where this placement appears" />
                </label>
              </div>
              <div>
                <label>
                  Price per day (TZS)
                  <input name="price" type="number" min="1" className="sw-input" placeholder="Leave empty for plan credit only" />
                </label>
              </div>
              <div>
                <label>
                  Maximum days
                  <input name="max" type="number" min="1" max="90" className="sw-input" defaultValue={30} required />
                </label>
              </div>
              <label className="flex gap-2">
                <input name="enabled" type="checkbox" defaultChecked={true} />
                Available for campaigns
              </label>
              <label className="flex gap-2">
                <input name="credit" type="checkbox" defaultChecked={true} />
                Allow included plan days
              </label>
              <button disabled={busy} className="sw-button">
                Create Placement
              </button>
            </form>
          )}
          <div className="sw-pricing">
            {query.data?.placements
              .filter((p) => p.id.startsWith(business?.organization_id ?? ''))
              .map((p) => (
                <div key={p.id} className="sw-panel">
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <p style={{ fontSize: 12, color: '#73849d' }}>
                    {p.price_daily_minor ? money(p.price_daily_minor, 'TZS') + '/day' : 'Plan allowance only'} · Max {p.max_days} days
                  </p>
                  <p style={{ fontSize: 11, color: p.enabled ? '#10b981' : '#ef4444' }}>
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              ))}
            {!query.data?.placements.some((p) => p.id.startsWith(business?.organization_id ?? '')) && (
              <p className="sw-notice">No custom placements yet. Create one to advertise in specific locations.</p>
            )}
          </div>
        </section>
      )}
      {creating && !admin && (
        <form
          className="sw-panel sw-form-grid"
          style={{ marginBlock: 24 }}
          onSubmit={(e) => void createPlacement(e)}
        >
          <div>
            <label>
              Placement ID
              <input name="id" className="sw-input" required minLength={3} maxLength={50} placeholder="e.g., my_banner" />
            </label>
          </div>
          <div>
            <label>
              Name
              <input name="name" className="sw-input" required minLength={3} maxLength={100} placeholder="e.g., My Custom Banner" />
            </label>
          </div>
          <div className="wide">
            <label>
              Description
              <input name="description" className="sw-input" required minLength={10} maxLength={500} placeholder="Describe where this placement appears" />
            </label>
          </div>
          <div>
            <label>
              Price per day (TZS)
              <input name="price" type="number" min="1" className="sw-input" placeholder="Leave empty for plan credit only" />
            </label>
          </div>
          <div>
            <label>
              Maximum days
              <input name="max" type="number" min="1" max="90" className="sw-input" defaultValue={30} required />
            </label>
          </div>
          <label className="flex gap-2">
            <input name="enabled" type="checkbox" defaultChecked={true} />
            Available for campaigns
          </label>
          <label className="flex gap-2">
            <input name="credit" type="checkbox" defaultChecked={true} />
            Allow included plan days
          </label>
          <button disabled={busy} className="sw-button">
            Create Placement
          </button>
        </form>
      )}
      {creating && !admin && (
        <form
          className="sw-panel sw-form-grid"
          style={{ marginBlock: 24 }}
          onSubmit={(e) => void create(e)}
        >
          <div>
            <label>
              Placement
              <select
                name="placement"
                required
                className="sw-input"
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
              >
                <option value="">Choose placement</option>
                {query.data?.placements
                  .filter((p) => p.enabled)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ·{' '}
                      {p.price_daily_minor
                        ? money(p.price_daily_minor, 'TZS') + '/day'
                        : 'Plan allowance only'}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Promote a vehicle or your business
              <select name="offer" className="sw-input">
                <option value="">Business profile</option>
                {offers.data?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Ad title
              <input name="title" className="sw-input" required minLength={3} maxLength={120} />
            </label>
          </div>
          <div>
            <label>
              Creative image
              <input
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sw-input"
              />
            </label>
          </div>
          <div>
            <label>
              Start
              <input className="sw-input" type="datetime-local" name="from" required />
            </label>
          </div>
          <div>
            <label>
              End
              <input className="sw-input" type="datetime-local" name="to" required />
            </label>
          </div>
          <div className="wide">
            <label>
              Message
              <textarea className="sw-input" name="description" maxLength={500} />
            </label>
          </div>
          <label className="wide flex gap-2">
            <input type="checkbox" name="credit" />
            Use included plan days
          </label>
          <p className="wide sw-notice">
            Charges use the placement's daily rate × started 24-hour periods. The server confirms
            the total. Ads remain hidden until payment or allowance is verified and an administrator
            approves them.
          </p>
          <button disabled={busy} className="sw-button">
            Submit Campaign
          </button>
        </form>
      )}
      <section className="sw-panel" style={{ marginBlock: 24, overflowX: 'auto' }}>
        <h2>{admin ? 'All Provider Campaigns' : 'My Campaigns'}</h2>
        <table className="sw-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Schedule</th>
              <th>Amount</th>
              <th>Payment / Review</th>
              <th>Views / Clicks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.campaigns.map((c) => {
              const stats = query.data.stats.find((s) => s.id === c.id),
                payment = query.data.payments.find(
                  (p) => p.campaign_id === c.id && p.status === 'pending',
                )
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title}</strong>
                    <CampaignPreview campaign={c} />
                    <br />
                    {query.data.placements.find((p) => p.id === c.placement_id)?.name}
                    <br />
                    {c.service}
                  </td>
                  <td>
                    {new Date(c.starts_at).toLocaleDateString()} –{' '}
                    {new Date(c.ends_at).toLocaleDateString()}
                  </td>
                  <td>
                    {c.payment_status === 'included'
                      ? 'Included in plan'
                      : money(c.amount_minor, 'TZS')}
                  </td>
                  <td>
                    {c.payment_status} / {new Date(c.ends_at) < new Date() ? 'expired' : c.status}
                    {c.review_note && <p>{c.review_note}</p>}
                  </td>
                  <td>
                    {stats?.impressions ?? 0} / {stats?.clicks ?? 0}
                  </td>
                  <td>
                    {admin ? (
                      <div className="flex gap-2">
                        {['approved', 'rejected', 'paused'].map((status) => (
                          <button
                            disabled={
                              busy ||
                              (status === 'approved' && c.payment_status === 'awaiting_payment')
                            }
                            className="sw-link"
                            key={status}
                            onClick={() =>
                              void run(() =>
                                rpc('marketplace_admin_marketing', {
                                  p_action: 'campaign',
                                  p_data: { id: c.id, status },
                                }),
                              )
                            }
                          >
                            {status === 'approved'
                              ? 'Approve'
                              : status === 'rejected'
                                ? 'Reject'
                                : 'Pause'}
                          </button>
                        ))}
                      </div>
                    ) : payment ? (
                      <button
                        className="sw-button"
                        disabled={busy}
                        onClick={() => void run(() => startCommerceCheckout(payment.id))}
                      >
                        Pay & Continue
                      </button>
                    ) : (
                      'Awaiting review / scheduled'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!query.data?.campaigns.length && (
          <EmptyMarketplace title="No campaigns yet">
            Provider campaigns will appear here with their actual payment and approval status.
          </EmptyMarketplace>
        )}
      </section>
      {admin && (
        <section className="sw-panel" style={{ overflowX: 'auto' }}>
          <h2>Provider Payments</h2>
          <p>
            Only record money actually received. Each offline receipt is saved in the audit log;
            recording payment does not approve the business or campaign.
          </p>
          <table className="sw-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.id.slice(0, 8)}</td>
                  <td>{p.campaign_id ? 'Advertising campaign' : 'Initial provider plan'}</td>
                  <td>{money(p.amount_minor, p.currency)}</td>
                  <td>{p.status}</td>
                  <td>
                    {p.status === 'pending' && (
                      <button className="sw-link" onClick={() => setReceipt(p)}>
                        Record Received Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {receipt && (
            <form
              className="sw-form-grid"
              style={{ marginTop: 20 }}
              onSubmit={(e) => {
                e.preventDefault()
                const d = new FormData(e.currentTarget)
                void run(async () => {
                  await rpc('marketplace_admin_receive_payment', {
                    p_id: receipt.id,
                    p_reference: fieldText(d.get('reference')),
                    p_amount: Math.round(Number(d.get('amount')) * 100),
                  })
                  setReceipt(null)
                })
              }}
            >
              <div>
                <label>
                  Receipt / bank transaction reference
                  <input name="reference" className="sw-input" required minLength={5} />
                </label>
              </div>
              <div>
                <label>
                  Amount received (TZS)
                  <input
                    name="amount"
                    className="sw-input"
                    type="number"
                    required
                    min="1"
                    step="0.01"
                  />
                </label>
              </div>
              <label className="wide flex gap-2">
                <input type="checkbox" required />I verified this payment was received for order{' '}
                {receipt.id.slice(0, 8)}.
              </label>
              <button className="sw-button" disabled={busy}>
                Record Receipt
              </button>
              <button
                type="button"
                className="sw-button secondary"
                onClick={() => setReceipt(null)}
              >
                Cancel
              </button>
            </form>
          )}
        </section>
      )}
    </>
  )
}

function CampaignPreview({ campaign }: { campaign: Campaign }) {
  const preview = useQuery({
    queryKey: ['swahivo', 'campaign-preview', campaign.id, campaign.image_path],
    queryFn: async () => {
      let path = campaign.image_path,
        bucket = 'marketplace-ads',
        destination: string | null = null
      if (campaign.offer_id) {
        const r = await marketplaceClient()
          .from('marketplace_offers')
          .select('images,slug')
          .eq('id', campaign.offer_id)
          .single()
        if (r.error) throw r.error
        destination = `/${campaign.service === 'rental' ? 'rentals' : 'cars'}/${r.data.slug}`
        if (!path) {
          path = r.data.images[0] ?? null
          bucket = 'marketplace-media'
        }
      }
      if (!path) return { url: null, destination }
      const r = await marketplaceClient().storage.from(bucket).createSignedUrl(path, 300)
      if (r.error) throw r.error
      return { url: r.data.signedUrl, destination }
    },
  })
  return (
    <details>
      <summary>Review creative</summary>
      <p>{campaign.description}</p>
      {preview.error ? (
        <p role="alert">{preview.error.message}</p>
      ) : preview.data?.url ? (
        <img
          src={preview.data.url}
          alt={campaign.title}
          width={240}
          style={{ maxWidth: '100%', borderRadius: 8 }}
        />
      ) : (
        <p>No image available</p>
      )}
      {preview.data?.destination && (
        <Link className="sw-link" to={preview.data.destination}>
          View vehicle
        </Link>
      )}
    </details>
  )
}
