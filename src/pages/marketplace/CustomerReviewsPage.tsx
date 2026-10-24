import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { fieldText, marketplaceClient } from '@/features/marketplace/api'
import { DashboardHeading } from './DashboardShell'
import { EmptyMarketplace } from './MarketplacePage'

export function CustomerReviewsPage() {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reviews = useQuery({
    queryKey: ['swahivo', 'my-reviews', user!.id],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_reviews')
        .select('*')
        .eq('author_id', user!.id)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const transactions = useQuery({
    queryKey: ['swahivo', 'reviewable-transactions', user!.id],
    queryFn: async () => {
      const [rentals, orders] = await Promise.all([
        marketplaceClient()
          .from('marketplace_reservations')
          .select('id,organization_id')
          .eq('customer_id', user!.id)
          .eq('status', 'completed'),
        marketplaceClient()
          .from('marketplace_orders')
          .select('id,organization_id')
          .eq('customer_id', user!.id)
          .eq('status', 'completed'),
      ])
      if (rentals.error) throw rentals.error
      if (orders.error) throw orders.error
      return [
        ...(rentals.data ?? []).map((r) => ({
          id: r.id,
          organization_id: r.organization_id,
          type: 'reservation_id' as const,
        })),
        ...(orders.data ?? []).map((r) => ({
          id: r.id,
          organization_id: fieldText(r.organization_id),
          type: 'order_id' as const,
        })),
      ]
    },
  })
  const available =
    transactions.data?.filter((t) => !reviews.data?.some((r) => r[t.type] === t.id)) ?? []
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const transaction = available.find((t) => t.id === data.get('transaction'))
      if (!transaction) throw new Error('Choose a completed transaction.')
      const r = await marketplaceClient()
        .from('marketplace_reviews')
        .insert({
          organization_id: transaction.organization_id,
          author_id: user!.id,
          [transaction.type]: transaction.id,
          rating: Number(data.get('rating')),
          body: fieldText(data.get('body')),
        })
      if (r.error) throw r.error
      await reviews.refetch()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Could not submit review.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <DashboardHeading
        title="My Reviews"
        description="Share your experience after a completed purchase or rental. Reviews are checked before publication."
      />
      {(error || reviews.error || transactions.error) && (
        <p role="alert" className="sw-notice">
          {error || reviews.error?.message || transactions.error?.message}
        </p>
      )}
      {!!available.length && (
        <form
          onSubmit={(e) => void submit(e)}
          className="sw-panel sw-form-grid"
          style={{ marginBottom: 24 }}
        >
          <div>
            <label htmlFor="review-transaction">Completed transaction</label>
            <select id="review-transaction" name="transaction" className="sw-input" required>
              <option value="">Choose a transaction</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.type === 'reservation_id' ? 'Rental' : 'Purchase'} · {t.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="review-rating">Rating</label>
            <select id="review-rating" name="rating" className="sw-input" required>
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {r} / 5
                </option>
              ))}
            </select>
          </div>
          <div className="wide">
            <label htmlFor="review-body">Your experience</label>
            <textarea
              id="review-body"
              name="body"
              className="sw-input"
              minLength={3}
              maxLength={4000}
              required
              rows={4}
            />
          </div>
          <button className="sw-button" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Review'}
          </button>
        </form>
      )}
      {reviews.data?.length ? (
        <section className="sw-panel">
          {reviews.data.map((r) => (
            <article key={r.id} style={{ padding: '18px 0', borderBottom: '1px solid #e4eaf2' }}>
              <strong>{fieldText(r.rating)} / 5</strong> ·{' '}
              <span className="sw-status">{r.status}</span>
              <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{fieldText(r.body)}</p>
            </article>
          ))}
        </section>
      ) : (
        !reviews.isPending && (
          <EmptyMarketplace title="Your experiences belong here">
            Complete a rental or purchase to leave a review of the provider.
          </EmptyMarketplace>
        )
      )}
    </>
  )
}
