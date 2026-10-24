import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, FileText, Star } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { marketplaceClient, rpc, money, type OperationalRecord } from '@/features/marketplace/api'
import { DashboardHeading, useOptionalMarketBusiness } from './DashboardShell'
import { EmptyMarketplace } from './MarketplacePage'

const modules = {
  orders: {
    title: 'Sales Orders',
    table: 'marketplace_orders',
    columns: ['buyer_name', 'amount_minor', 'payment_status', 'status', 'created_at'],
  },
  'test-drives': {
    title: 'Test Drive Requests',
    table: 'marketplace_test_drives',
    columns: ['starts_at', 'ends_at', 'notes', 'status', 'created_at'],
  },
  financing: {
    title: 'Financing Requests',
    table: 'marketplace_finance_requests',
    columns: ['message', 'status', 'created_at'],
  },
  reviews: {
    title: 'Customer Reviews',
    table: 'marketplace_reviews',
    columns: ['rating', 'body', 'status', 'created_at'],
  },
  promotions: {
    title: 'Advertising & Promotions',
    table: 'marketplace_promotions',
    columns: ['starts_at', 'ends_at', 'note', 'status', 'created_at'],
  },
  support: {
    title: 'Support Tickets',
    table: 'marketplace_support_tickets',
    columns: ['subject', 'message', 'response', 'status', 'created_at'],
  },
  contacts: {
    title: 'WhatsApp & Phone Contact Events',
    table: 'marketplace_contact_events',
    columns: ['channel', 'offer_id', 'created_at'],
  },
} as const
export type OperationKind = keyof typeof modules
export function OperationsPage({
  kind,
  admin = false,
  customer = false,
}: {
  kind: OperationKind
  admin?: boolean
  customer?: boolean
}) {
  const { user } = useAuth()
  const business = useOptionalMarketBusiness()
  const config = modules[kind]
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = useQuery({
    queryKey: ['swahivo', 'operations', kind, admin, customer, business?.organization_id, user?.id],
    queryFn: async () => {
      let q = marketplaceClient()
        .from(config.table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
      if (!admin && business && kind !== 'support')
        q = q.eq('organization_id', business.organization_id)
      if (!admin && kind === 'support') q = q.eq('user_id', user!.id)
      if (customer && kind !== 'support')
        q = q.eq(kind === 'reviews' ? 'author_id' : 'customer_id', user!.id)
      const result = await q
      if (result.error) throw result.error
      return result.data ?? []
    },
  })
  const offers = useQuery({
    queryKey: ['swahivo', 'operational-offers', business?.organization_id],
    enabled: !!business && ['orders', 'promotions'].includes(kind),
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_offers')
        .select('*')
        .eq('organization_id', business!.organization_id)
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const canCreate =
    kind === 'support' || (!admin && !customer && ['orders', 'promotions'].includes(kind))
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      if (kind === 'orders')
        await rpc('marketplace_create_order', {
          p_offer_id: fieldText(data.get('offer')),
          p_buyer_name: fieldText(data.get('name')),
          p_buyer_email: fieldText(data.get('email')) || null,
          p_notes: fieldText(data.get('note')) || null,
        })
      else if (kind === 'support') {
        const r = await marketplaceClient()
          .from('marketplace_support_tickets')
          .insert({
            user_id: user!.id,
            subject: fieldText(data.get('subject')),
            message: fieldText(data.get('message')),
          })
        if (r.error) throw r.error
      } else if (kind === 'promotions') {
        const r = await marketplaceClient()
          .from('marketplace_promotions')
          .insert({
            organization_id: business!.organization_id,
            offer_id: fieldText(data.get('offer')),
            starts_at: new Date(fieldText(data.get('from'))).toISOString(),
            ends_at: new Date(fieldText(data.get('to'))).toISOString(),
            note: fieldText(data.get('note')),
          })
        if (r.error) throw r.error
      }
      setCreating(false)
      await rows.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not save this record.')
    } finally {
      setBusy(false)
    }
  }
  async function change(row: OperationalRecord, status: string) {
    setError('')
    try {
      if (kind === 'orders')
        await rpc('marketplace_update_order', { p_order_id: row.id, p_status: status })
      else if (admin && ['reviews', 'promotions'].includes(kind))
        await rpc('marketplace_admin_moderate', {
          p_kind: kind === 'reviews' ? 'review' : 'promotion',
          p_id: row.id,
          p_status: status,
        })
      else {
        const r = await marketplaceClient().from(config.table).update({ status }).eq('id', row.id)
        if (r.error) throw r.error
      }
      await rows.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not update status.')
    }
  }
  function display(row: OperationalRecord, column: string) {
    const v = row[column]
    if (v === null || v === undefined || v === '') return '—'
    if (column.endsWith('_at')) return new Date(fieldText(v)).toLocaleString()
    if (column === 'amount_minor') return money(Number(v), fieldText(row.currency ?? 'TZS'))
    if (column === 'rating') return `${fieldText(v)} / 5`
    if (column === 'offer_id') return fieldText(v).slice(0, 8)
    return fieldText(v)
  }
  return (
    <>
      <DashboardHeading
        title={config.title}
        description={
          kind === 'contacts'
            ? 'Recorded contact-button clicks. These are not message-delivery receipts or confirmed leads.'
            : kind === 'financing'
              ? 'Requests for information only. No credit decision or financing approval is implied.'
              : kind === 'orders'
                ? 'Real sale records. Payment must be verified before a sale can complete.'
                : 'Your real records, saved securely in Supabase.'
        }
        action={
          canCreate ? (
            <button className="sw-button" onClick={() => setCreating(!creating)}>
              <Plus size={16} />
              {kind === 'orders'
                ? 'Create Order'
                : kind === 'support'
                  ? 'Open Ticket'
                  : 'Request Promotion'}
            </button>
          ) : undefined
        }
      />
      {error && (
        <p className="sw-notice" role="alert" style={{ color: '#c21b35', marginBottom: 20 }}>
          {error}
        </p>
      )}
      {creating && (
        <form
          onSubmit={(e) => void create(e)}
          className="sw-panel sw-form-grid"
          style={{ marginBottom: 24 }}
        >
          {['orders', 'promotions'].includes(kind) && (
            <div className="wide">
              <label htmlFor="operation-offer">Vehicle listing</label>
              <select id="operation-offer" name="offer" className="sw-input" required>
                <option value="">Choose a listing</option>
                {offers.data
                  ?.filter((o) => kind !== 'orders' || o.service === 'dealership')
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} · {o.status}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {kind === 'orders' && (
            <>
              <div>
                <label htmlFor="order-buyer">Buyer name</label>
                <input id="order-buyer" name="name" className="sw-input" minLength={2} required />
              </div>
              <div>
                <label htmlFor="order-email">Buyer email</label>
                <input id="order-email" name="email" type="email" className="sw-input" />
              </div>
              <div className="wide sw-notice">
                The amount is taken from the selected sale listing on the server. New orders are
                unpaid. Completing an order requires verified payment.
              </div>
            </>
          )}
          {kind === 'promotions' && (
            <>
              <div>
                <label htmlFor="promo-from">Requested start</label>
                <input
                  id="promo-from"
                  name="from"
                  type="datetime-local"
                  className="sw-input"
                  required
                />
              </div>
              <div>
                <label htmlFor="promo-to">Requested end</label>
                <input
                  id="promo-to"
                  name="to"
                  type="datetime-local"
                  className="sw-input"
                  required
                />
              </div>
              <p className="wide sw-notice">
                This is a promotion request. It does not charge your account or guarantee placement.
                An administrator must review it.
              </p>
            </>
          )}
          {kind === 'support' ? (
            <>
              <div className="wide">
                <label htmlFor="ticket-subject">Subject</label>
                <input
                  className="sw-input"
                  id="ticket-subject"
                  name="subject"
                  minLength={3}
                  maxLength={200}
                  required
                />
              </div>
              <div className="wide">
                <label htmlFor="ticket-message">How can we help?</label>
                <textarea
                  className="sw-input"
                  id="ticket-message"
                  name="message"
                  minLength={3}
                  maxLength={8000}
                  rows={4}
                  required
                />
              </div>
            </>
          ) : (
            <div className="wide">
              <label htmlFor="operation-note">Notes</label>
              <textarea className="sw-input" name="note" id="operation-note" rows={3} />
            </div>
          )}
          <button className="sw-button wide" disabled={busy}>
            {busy ? 'Saving…' : 'Save Record'}
          </button>
        </form>
      )}
      <div className="sw-panel" style={{ overflowX: 'auto' }}>
        {rows.error ? (
          <p role="alert">{rows.error.message}</p>
        ) : rows.data?.length ? (
          <table className="sw-table">
            <thead>
              <tr>
                {config.columns.map((c) => (
                  <th key={c}>{c.replaceAll('_', ' ')}</th>
                ))}
                {!customer && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => (
                <tr key={row.id}>
                  {config.columns.map((c) => (
                    <td key={c} style={{ maxWidth: 330, whiteSpace: 'pre-wrap' }}>
                      {c === 'status' ? (
                        <span className="sw-status">{display(row, c)}</span>
                      ) : (
                        display(row, c)
                      )}
                    </td>
                  ))}
                  {!customer && (
                    <td>
                      {kind === 'orders' && !['completed', 'cancelled'].includes(row.status) ? (
                        <select
                          className="sw-input"
                          value={row.status}
                          onChange={(e) => void change(row, e.target.value)}
                        >
                          {['pending', 'confirmed', 'completed', 'cancelled'].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : kind === 'test-drives' || kind === 'financing' ? (
                        <select
                          className="sw-input"
                          value={row.status}
                          onChange={(e) => void change(row, e.target.value)}
                        >
                          {(kind === 'test-drives'
                            ? ['requested', 'confirmed', 'completed', 'cancelled']
                            : ['new', 'contacted', 'referred', 'closed']
                          ).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : admin && kind === 'reviews' ? (
                        <div className="flex gap-2">
                          <button className="sw-link" onClick={() => void change(row, 'published')}>
                            Publish
                          </button>
                          <button className="sw-link" onClick={() => void change(row, 'rejected')}>
                            Reject
                          </button>
                        </div>
                      ) : admin && kind === 'promotions' ? (
                        <div className="flex gap-2">
                          <button className="sw-link" onClick={() => void change(row, 'approved')}>
                            Approve
                          </button>
                          <button className="sw-link" onClick={() => void change(row, 'rejected')}>
                            Reject
                          </button>
                        </div>
                      ) : admin && kind === 'support' ? (
                        <>
                          <select
                            className="sw-input"
                            value={row.status}
                            onChange={(e) => void change(row, e.target.value)}
                          >
                            {['open', 'in_progress', 'resolved'].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                          <form
                            className="flex gap-2"
                            style={{ marginTop: 8 }}
                            onSubmit={(e) => {
                              e.preventDefault()
                              const data = new FormData(e.currentTarget)
                              void marketplaceClient()
                                .from('marketplace_support_tickets')
                                .update({ response: fieldText(data.get('reply')) })
                                .eq('id', row.id)
                                .then((r) => {
                                  if (r.error) setError(r.error.message)
                                  else void rows.refetch()
                                })
                            }}
                          >
                            <input
                              name="reply"
                              aria-label="Support response"
                              className="sw-input"
                              required
                            />
                            <button className="sw-button secondary">Reply</button>
                          </form>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyMarketplace title={`No ${config.title.toLowerCase()} yet`}>
            {kind === 'reviews'
              ? 'Only customers with a completed transaction can submit a review.'
              : kind === 'contacts'
                ? 'Provider-specific contact-button clicks appear here when signed-in visitors use them.'
                : 'Records will appear here when created through the corresponding Swahivo workflow.'}
          </EmptyMarketplace>
        )}
      </div>
      {kind === 'reviews' && (
        <p style={{ fontSize: 11, color: '#8392a6', marginTop: 15 }}>
          <Star size={13} style={{ display: 'inline' }} /> Reviews require a genuine completed order
          or rental and platform moderation.
        </p>
      )}
      {kind === 'support' && (
        <p style={{ fontSize: 11, color: '#8392a6', marginTop: 15 }}>
          <FileText size={13} style={{ display: 'inline' }} /> Your ticket is visible only to your
          account and authorized platform administrators.
        </p>
      )}
    </>
  )
}
