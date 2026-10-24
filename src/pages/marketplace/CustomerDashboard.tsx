import { AdSlot } from '@/features/marketplace/Advertising'
import { fieldText } from '@/features/marketplace/api'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CarFront, Heart, MessageCircle, CalendarDays } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'
import { marketplaceClient, withPhotos, money } from '@/features/marketplace/api'
import { getSupabaseClient } from '@/lib/supabase/client'
import { DashboardHeading, Metrics } from './DashboardShell'
import { EmptyMarketplace, OfferCard } from './MarketplacePage'

export function CustomerDashboard() {
  const { module = 'dashboard' } = useParams()
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const favorites = useQuery({
    queryKey: ['swahivo', 'customer-favorites', user?.id],
    queryFn: async () => {
      const f = await marketplaceClient()
        .from('marketplace_favorites')
        .select('offer_id')
        .eq('user_id', user!.id)
      if (f.error) throw f.error
      if (!f.data.length) return []
      const r = await marketplaceClient()
        .from('marketplace_catalogue')
        .select('*')
        .in(
          'id',
          f.data.map((x) => x.offer_id),
        )
      if (r.error) throw r.error
      return withPhotos(r.data ?? [])
    },
  })
  const enquiries = useQuery({
    queryKey: ['swahivo', 'customer-enquiries', user?.id],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_enquiries')
        .select('*')
        .eq('customer_id', user!.id)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  const bookings = useQuery({
    queryKey: ['swahivo', 'customer-bookings', user?.id],
    queryFn: async () => {
      const r = await marketplaceClient()
        .from('marketplace_reservations')
        .select('*')
        .eq('customer_id', user!.id)
        .order('created_at', { ascending: false })
      if (r.error) throw r.error
      return r.data ?? []
    },
  })
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaved(false)
    setError('')
    const r = await getSupabaseClient()
      .from('profiles')
      .update({
        full_name: fieldText(data.get('name')),
        phone: fieldText(data.get('phone')) || null,
      })
      .eq('id', user!.id)
    if (r.error) setError(r.error.message)
    else setSaved(true)
  }
  const names: Record<string, string> = {
    dashboard: 'Your Swahivo Dashboard',
    saved: 'Saved Vehicles',
    enquiries: 'My Enquiries',
    bookings: 'My Booking Requests',
    profile: 'My Profile',
  }
  return (
    <>
      <DashboardHeading
        title={names[module] ?? 'Your Swahivo Dashboard'}
        description="Find, explore, and drive your next chapter with Swahivo."
        action={
          <Link className="sw-button" to="/cars">
            Browse All Cars <CarFront size={16} />
          </Link>
        }
      />
      {module === 'dashboard' && (
        <>
          <div className="sw-owner-hero" style={{ marginTop: 0, minHeight: 200 }}>
            <div>
              <p className="sw-eyebrow">Welcome back</p>
              <h2>{String(user?.user_metadata.full_name ?? 'Your next journey awaits')}</h2>
              <p>Find a car to call your own, or a vehicle for the journey ahead.</p>
            </div>
          </div>
          <div className="sw-shortcuts">
            {[
              ['Browse Cars', '/cars'],
              ['New Cars', '/cars?condition=new'],
              ['Used Cars', '/cars?condition=used'],
              ['Rent a Vehicle', '/rentals'],
              ['Saved Cars', '/customer/saved'],
              ['My Enquiries', '/customer/enquiries'],
            ].map(([label, url]) => (
              <Link key={url} to={url!}>
                {label}
              </Link>
            ))}
          </div>
          <AdSlot placement="buyer_dashboard" />
          <Metrics
            items={[
              { label: 'Saved Vehicles', value: favorites.data?.length ?? 0, icon: Heart },
              { label: 'Your Enquiries', value: enquiries.data?.length ?? 0, icon: MessageCircle },
              { label: 'Booking Requests', value: bookings.data?.length ?? 0, icon: CalendarDays },
              {
                label: 'Completed Bookings',
                value: bookings.data?.filter((b) => b.status === 'completed').length ?? 0,
                icon: CarFront,
              },
            ]}
          />
        </>
      )}
      {(module === 'dashboard' || module === 'saved') && (
        <section className="sw-section">
          <div className="sw-section-head">
            <h2>Saved Vehicles</h2>
            <Link to="/cars" className="sw-link">
              Discover vehicles →
            </Link>
          </div>
          {favorites.error ? (
            <p role="alert">{favorites.error.message}</p>
          ) : favorites.data?.length ? (
            <div className="sw-listings">
              {favorites.data.map((o) => (
                <OfferCard offer={o} key={o.id} />
              ))}
            </div>
          ) : (
            <EmptyMarketplace title="Your favorites belong here">
              Tap the heart on a published vehicle to save it to your account.
            </EmptyMarketplace>
          )}
        </section>
      )}
      {(module === 'dashboard' || module === 'enquiries') && (
        <section className="sw-panel" style={{ marginBlock: 24, overflowX: 'auto' }}>
          <h2>My Enquiries</h2>
          {enquiries.error ? (
            <p role="alert">{enquiries.error.message}</p>
          ) : enquiries.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Message</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.data.map((e) => (
                  <tr key={e.id}>
                    <td>{e.service}</td>
                    <td>{e.message}</td>
                    <td>{new Date(e.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className="sw-status">{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="No enquiries yet">
              Contact the provider on any vehicle page to start a conversation.
            </EmptyMarketplace>
          )}
        </section>
      )}
      {(module === 'dashboard' || module === 'bookings') && (
        <section className="sw-panel" style={{ overflowX: 'auto' }}>
          <h2>My Rental Requests</h2>
          {bookings.error ? (
            <p role="alert">{bookings.error.message}</p>
          ) : bookings.data?.length ? (
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Pickup</th>
                  <th>Return</th>
                  <th>Location</th>
                  <th>Rental Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.data.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.starts_at).toLocaleString()}</td>
                    <td>{new Date(b.ends_at).toLocaleString()}</td>
                    <td>{b.pickup_location}</td>
                    <td>{money(b.total_minor, b.currency)}</td>
                    <td>
                      <span className="sw-status">{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyMarketplace title="Your next trip is waiting">
              Browse rental vehicles and submit a booking request for your travel dates.
            </EmptyMarketplace>
          )}
        </section>
      )}
      {module === 'profile' && (
        <form className="sw-panel sw-form-grid" onSubmit={(e) => void saveProfile(e)}>
          <div>
            <label htmlFor="profile-name">Full name</label>
            <input
              className="sw-input"
              name="name"
              id="profile-name"
              defaultValue={String(user?.user_metadata.full_name ?? '')}
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor="profile-phone">Phone</label>
            <input className="sw-input" name="phone" id="profile-phone" type="tel" maxLength={32} />
          </div>
          <div className="wide">
            <label>Email address</label>
            <p>{user?.email}</p>
          </div>
          {error && (
            <p className="wide sw-notice" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="wide sw-notice" role="status">
              Your profile was saved.
            </p>
          )}
          <button className="sw-button wide">Save Profile</button>
        </form>
      )}
    </>
  )
}
