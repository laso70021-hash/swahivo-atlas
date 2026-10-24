import { createContext, useContext, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  CarFront,
  LayoutDashboard,
  MessageCircle,
  UsersRound,
  Settings,
  CreditCard,
  PlusCircle,
  CalendarDays,
  ShieldCheck,
  Store,
  Globe,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  FileText,
  BadgeDollarSign,
  Heart,
} from 'lucide-react'
import { Wordmark } from '@/components/brand/Wordmark'
import { useAuth } from '@/features/auth/auth-context'
import {
  useMarketplaceAccount,
  useMarketplaceRealtime,
  type Business,
  type ServiceType,
} from '@/features/marketplace/api'

const BusinessContext = createContext<Business | null>(null)
export function useOptionalMarketBusiness() {
  return useContext(BusinessContext)
}
export function useMarketBusiness() {
  const value = useContext(BusinessContext)
  if (!value) throw new Error('Approved business workspace required.')
  return value
}

/**
 * Wrapper component that provides business context without the DashboardShell UI.
 * Used for integrating marketplace pages into the rental AppShell.
 */
export function BusinessContextProvider({ children, service }: { children: ReactNode; service: ServiceType }) {
  useMarketplaceRealtime()
  const { user, status } = useAuth()
  const account = useMarketplaceAccount()

  if (status === 'loading' || (user && account.isPending))
    return <div className="sw-empty">Loading your Swahivo workspace…</div>
  if (!user) return <Navigate to="/sign-in" replace />

  const businesses =
    account.data?.businesses.filter((b) => b.services.includes(service)) ?? []
  const business = businesses[0]

  return <BusinessContext.Provider value={business ?? null}>{children}</BusinessContext.Provider>
}
export function DashboardShell({ mode }: { mode: 'admin' | 'customer' | ServiceType }) {
  useMarketplaceRealtime()
  const { user, status, signOut } = useAuth()
  const account = useMarketplaceAccount()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const location = useLocation()
  if (status === 'loading' || (user && account.isPending))
    return <div className="sw-empty">Loading your Swahivo workspace…</div>
  if (!user) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  if (account.error)
    return (
      <div className="sw-empty">
        <h2>Your workspace could not be loaded</h2>
        <p>{account.error.message}</p>
        <Link to="/" className="sw-link">
          Return to marketplace
        </Link>
      </div>
    )
  if (mode === 'admin' && !account.data?.is_admin)
    return (
      <div className="sw-empty">
        <ShieldCheck />
        <h2>Platform administrator access required</h2>
        <Link to="/dashboard" className="sw-link">
          Return to your dashboard
        </Link>
      </div>
    )
  const businesses =
    account.data?.businesses.filter((b) =>
      mode === 'dealership' || mode === 'rental' ? b.services.includes(mode) : true,
    ) ?? []
  const business = businesses.find((b) => b.organization_id === selected) ?? businesses[0]
  if ((mode === 'dealership' || mode === 'rental') && !business)
    return <Navigate to="/customer/dashboard" replace />
  const prefix =
    mode === 'admin'
      ? '/admin'
      : mode === 'customer'
        ? '/customer'
        : mode === 'dealership'
          ? '/seller'
          : '/rental/marketplace'
  const items: ReadonlyArray<readonly [string, string, typeof CarFront]> =
    mode === 'admin'
      ? [
          ['Platform Dashboard', 'dashboard', LayoutDashboard],
          ['Business Approvals', 'applications', ShieldCheck],
          ['Businesses', 'businesses', Store],
          ['Vehicle Listings', 'listings', CarFront],
          ['Listing Approvals', 'approvals', ShieldCheck],
          ['Enquiries', 'enquiries', MessageCircle],
          ['Reservations', 'reservations', CalendarDays],
          ['Shared CRM', 'crm', UsersRound],
          ['Subscription Packages', 'packages', CreditCard],
          ['Audit Logs', 'audit', FileText],
          ['Sales Orders', 'orders', FileText],
          ['Test Drives', 'test-drives', CalendarDays],
          ['Financing Requests', 'financing', CreditCard],
          ['Reviews', 'reviews', Heart],
          ['Campaigns', 'promotions', Globe],
          ['Support Tickets', 'support', MessageCircle],
          ['Platform Users', 'users', UsersRound],
          ['Rental Fleet', 'fleet', CarFront],
          ['Brands', 'brands', CarFront],
          ['Categories', 'categories', Store],
          ['Content Management', 'content', FileText],
          ['Marketing & Ads', 'marketing', Globe],
        ]
      : mode === 'customer'
        ? [
            ['Dashboard', 'dashboard', LayoutDashboard],
            ['Saved Vehicles', 'saved', Heart],
            ['My Enquiries', 'enquiries', MessageCircle],
            ['My Bookings', 'bookings', CalendarDays],
            ['My Orders', 'orders', FileText],
            ['My Profile', 'profile', UsersRound],
            ['My Reviews', 'reviews', Heart],
            ['Test Drives', 'test-drives', CalendarDays],
            ['Financing Enquiries', 'financing', CreditCard],
            ['Support', 'support', MessageCircle],
          ]
        : [
            ['Dashboard', 'dashboard', LayoutDashboard],
            ['My Listings', 'listings', CarFront],
            ['Add Listing', 'listings/new', PlusCircle],
            ['Enquiries', 'enquiries', MessageCircle],
            ...(mode === 'rental'
              ? [['Booking Requests', 'reservations', CalendarDays] as const]
              : []),
            ['Customers / CRM', 'crm', UsersRound],
            ['Subscription', 'subscription', CreditCard],
            ['Business Settings', 'settings', Settings],
            ...(mode === 'dealership'
              ? [
                  ['Sales Orders', 'orders', FileText] as const,
                  ['Test Drives', 'test-drives', CalendarDays] as const,
                  ['Financing Requests', 'financing', CreditCard] as const,
                ]
              : []),
            ['Contact Events', 'contacts', MessageCircle],
            ['Reviews', 'reviews', Heart],
            ['Campaigns', 'promotions', Globe],
            ['Support', 'support', MessageCircle],
          ]
  const name = String(user.user_metadata.full_name ?? user.email?.split('@')[0] ?? 'Your account')
  const sidebar = (
    <>
      <Link to="/" style={{ display: 'flex', justifyContent: 'center', padding: '15px 15px 23px' }}>
        <Wordmark tone={mode === 'customer' ? 'default' : 'inverse'} size="lg" />
      </Link>
      {businesses.length > 1 && (
        <select
          aria-label="Business workspace"
          className="sw-input"
          value={business?.organization_id}
          onChange={(e) => setSelected(e.target.value)}
          style={{ margin: '0 15px 20px', width: 'calc(100% - 30px)' }}
        >
          {businesses.map((b) => (
            <option key={b.organization_id} value={b.organization_id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
      <nav
        style={{ padding: '0 13px', display: 'grid', gap: 5, overflowY: 'auto', minHeight: 0 }}
        aria-label="Dashboard navigation"
      >
        {account.data?.applications.some(a => a.status === 'pending') && <Link to="/provider/onboarding" className="sw-button">Choose Plan / Payment Hold</Link>}
{items.map(([label, path, Icon]) => (
          <NavLink
            end={path === 'dashboard'}
            key={path}
            to={`${prefix}/${path}`}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-3 text-[12px] ${isActive ? 'bg-brand-500 text-white' : 'hover:bg-white/5'}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '25px 20px' }}>
        {mode === 'admin' && businesses.some((b) => b.services.includes('rental')) && (
          <Link
            className="sw-link"
            style={{ display: 'block', marginBottom: 16 }}
            to="/rental/marketplace/dashboard"
          >
            My Rental Workspace →
          </Link>
        )}
        {mode === 'admin' && businesses.some((b) => b.services.includes('dealership')) && (
          <Link
            className="sw-link"
            style={{ display: 'block', marginBottom: 16 }}
            to="/seller/dashboard"
          >
            My Dealership Workspace →
          </Link>
        )}
        {business?.services.length === 2 && (
          <div style={{ display: 'grid', gap: 9, marginBottom: 20 }}>
            <span style={{ fontSize: 10, color: '#8496ad' }}>SWITCH SERVICE</span>
            <Link
              to={mode === 'dealership' ? '/rental/marketplace/dashboard' : '/seller/dashboard'}
              className="sw-button outline"
              style={{ fontSize: 11, padding: '10px' }}
            >
              Switch to {mode === 'dealership' ? 'Rental' : 'Dealership'}
            </Link>
          </div>
        )}
        {account.data?.is_admin && mode !== 'admin' && (
          <Link
            to="/admin/dashboard"
            className="sw-link"
            style={{ marginBottom: 18, color: '#ff657a' }}
          >
            Platform administration
          </Link>
        )}
        <Link to="/" style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
          <Globe size={17} /> Visit Marketplace
        </Link>
      </div>
    </>
  )
  return (
    <BusinessContext.Provider value={business ?? null}>
      <div className="sw-page" style={{ display: 'flex' }}>
        <aside
          className={mode === 'customer' ? '' : 'sw-dashboard-sidebar'}
          style={{
            width: 240,
            flexShrink: 0,
            minHeight: '100vh',
            position: 'sticky',
            top: 0,
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #e3eaf3',
          }}
          data-dashboard-sidebar
        >
          {sidebar}
        </aside>
        {open && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#07182580' }}
            onClick={() => setOpen(false)}
          >
            <aside
              className="sw-dashboard-sidebar"
              style={{
                width: 250,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close dashboard navigation"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  background: 'none',
                  border: 0,
                  color: 'white',
                }}
              >
                <X size={17} />
              </button>
              {sidebar}
            </aside>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <header
            style={{
              height: 77,
              background: 'white',
              borderBottom: '1px solid #e3eaf3',
              display: 'flex',
              alignItems: 'center',
              padding: '0 27px',
              gap: 16,
            }}
          >
            <button
              className="sw-dashboard-menu"
              aria-label="Open dashboard navigation"
              onClick={() => setOpen(true)}
              style={{ display: 'none', border: 0, background: 'none' }}
            >
              <Menu />
            </button>
            <form
              action="/cars"
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                background: '#f1f5fa',
                border: '1px solid #e5edf5',
                padding: '9px 15px',
                borderRadius: 7,
                maxWidth: 420,
                width: '100%',
              }}
            >
              <Search size={17} color="#6c7f98" />
              <input
                name="make"
                aria-label="Search marketplace vehicles"
                placeholder="Search the marketplace…"
                style={{ border: 0, outline: 0, background: 'none', width: '100%', fontSize: 12 }}
              />
            </form>
            <Link
              to={
                mode === 'admin'
                  ? '/admin/applications'
                  : mode === 'customer'
                    ? '/customer/enquiries'
                    : `${prefix}/enquiries`
              }
              aria-label="Open enquiries"
              style={{ marginLeft: 'auto' }}
            >
              <Bell size={19} />
            </Link>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: '#eaf0f8',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                color: '#365775',
                flexShrink: 0,
              }}
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {name}
              <span style={{ display: 'block', fontSize: 10, color: '#6f849c' }}>
                {mode === 'admin'
                  ? 'Platform administrator'
                  : (business?.name ?? 'Customer account')}
              </span>
            </div>
            <button
              aria-label="Sign out"
              onClick={() => void signOut()}
              style={{ border: 0, background: 'none', color: '#69809a' }}
            >
              <LogOut size={17} />
            </button>
          </header>
          <main
            style={{ padding: '30px clamp(16px,3vw,36px)', maxWidth: 1580, marginInline: 'auto' }}
          >
            <Outlet />
          </main>
        </div>
      </div>
      <style>{`@media(max-width:1000px){[data-dashboard-sidebar]{display:none!important}.sw-dashboard-menu{display:block!important}}`}</style>
    </BusinessContext.Provider>
  )
}
export function DashboardHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="sw-dashboard-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function Metrics({
  items,
}: {
  items: Array<{ label: string; value: string | number; icon?: typeof CarFront }>
}) {
  return (
    <div className="sw-metrics">
      {items.map((item) => {
        const Icon = item.icon ?? BadgeDollarSign
        return (
          <article className="sw-metric" key={item.label}>
            <div className="sw-service-icon" style={{ width: 48, height: 48 }}>
              <Icon />
            </div>
            <div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}
