import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check } from 'lucide-react'
import { marketplaceClient } from '@/features/marketplace/api'
import { PublicHeader, PublicFooter, EmptyMarketplace } from './MarketplacePage'

export function PricingPage() {
  const [usd, setUsd] = useState(false)
  const packages = useQuery({
    queryKey: ['swahivo', 'packages'],
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
  const exchange = useQuery({
    queryKey: ['swahivo', 'tzs-usd'],
    enabled: usd,
    staleTime: 3600000,
    queryFn: async () => {
      const response = await fetch('https://open.er-api.com/v6/latest/TZS')
      if (!response.ok) throw new Error('Live currency conversion is currently unavailable.')
      const data = (await response.json()) as {
        result: string
        rates: { USD?: number }
        time_last_update_utc: string
      }
      if (data.result !== 'success' || !data.rates.USD)
        throw new Error('Live currency conversion is currently unavailable.')
      return { rate: data.rates.USD, updated: data.time_last_update_utc }
    },
  })
  return (
    <div className="sw-page">
      <PublicHeader />
      <main className="sw-container sw-section">
        <div style={{ textAlign: 'center', paddingBlock: 30 }}>
          <p className="sw-eyebrow" style={{ color: '#f7102c' }}>
            Grow at your own pace
          </p>
          <h1 style={{ fontSize: 43, fontWeight: 800, letterSpacing: -1.3 }}>
            Your business. Your next chapter.
          </h1>
          <p style={{ color: '#72849e', marginTop: 15 }}>
            Dealership listing packages. Separate rental entitlements. One business account.
          </p>
          <div
            className="sw-tabs"
            style={{ justifyContent: 'center', background: 'none', border: 0, marginTop: 20 }}
          >
            <button className={!usd ? 'active' : ''} onClick={() => setUsd(false)}>
              TZS
            </button>
            <button className={usd ? 'active' : ''} onClick={() => setUsd(true)}>
              USD estimate
            </button>
          </div>
          {usd && (
            <p style={{ fontSize: 11, color: '#7788a0' }}>
              {exchange.isPending
                ? 'Fetching live exchange rate…'
                : exchange.error
                  ? exchange.error.message
                  : `Indicative conversion · ${new Date(exchange.data.updated).toLocaleDateString()} · Charges settle in TZS.`}{' '}
              <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
                Rates by ExchangeRate-API
              </a>
            </p>
          )}
        </div>
        {packages.error ? (
          <EmptyMarketplace title="Packages could not be loaded">
            {packages.error.message}
          </EmptyMarketplace>
        ) : (
          <div className="sw-pricing">
            {packages.data
              ?.filter((p) => p.service === 'dealership')
              .map((plan) => (
                <article key={plan.id} className="sw-plan">
                  <h3>{plan.name}</h3>
                  <div className="sw-price">
                    {usd
                      ? exchange.data
                        ? new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format((plan.monthly_tzs ?? 0) * exchange.data.rate)
                        : '—'
                      : new Intl.NumberFormat('en-TZ').format(plan.monthly_tzs ?? 0)}{' '}
                    <small>{usd ? 'USD estimate' : 'TZS'} / month</small>
                  </div>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <Link className="sw-button" to="/register/business?service=dealership">
                    {plan.monthly_tzs === 0 ? 'Start Free' : 'Register Your Business'}{' '}
                    <ArrowRight size={14} />
                  </Link>
                  <p style={{ fontSize: 10, color: '#8392a8', marginTop: 14 }}>
                    {plan.stripe_price_id
                      ? 'Checkout available after provider approval.'
                      : plan.monthly_tzs === 0
                        ? 'Free listing allowance after business approval.'
                        : 'Paid activation requires a configured payment provider.'}
                  </p>
                </article>
              ))}
          </div>
        )}
        <section className="sw-promo">
          <div>
            <h2>A rental business deserves its own plan.</h2>
            <p>
              Rental fleet, staff seats, contracts and GPS are managed separately from sale-listing
              allowances. Rental subscription pricing is pending administrator configuration.
            </p>
            <Link className="sw-button" to="/register/business?service=rental">
              Register a Rental Agency <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <div className="sw-notice">
          <Check size={17} style={{ display: 'inline', marginRight: 8 }} />A dealership package
          never limits the size of your rental fleet. Paid subscriptions activate only after
          verified payment.
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
