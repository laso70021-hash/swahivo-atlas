import { Seo } from '@/features/marketplace/Seo'
import { Suspense, lazy } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'

import { FullPageLoader } from '@/components/feedback/FullPageLoader'
import { navigationGroups } from '@/components/layout/navigation'
import { ModulePage } from '@/pages/ModulePage'

import {
  RequireAnonymous,
  RequireAuth,
  RequireNoOrganization,
  RequireOrganization,
  RequirePermission,
  RequireRentalService,
  WithWorkspace,
} from './guards'
import { paths } from './paths'
import { upcomingModules } from './upcomingModules'

/*
 * Routes are code-split along the boundary that matters: someone arriving at the
 * sign-in screen should not download the dashboard, its charts and its settings
 * forms before they can type a password. The shell and the authenticated pages
 * load once a session exists.
 */
const AppShell = lazy(() =>
  import('@/components/layout/AppShell').then((module) => ({ default: module.AppShell })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)

const VehiclesPage = lazy(() =>
  import('@/pages/vehicles/VehiclesPage').then((module) => ({ default: module.VehiclesPage })),
)
const VehicleNewPage = lazy(() =>
  import('@/pages/vehicles/VehicleNewPage').then((module) => ({ default: module.VehicleNewPage })),
)
const VehicleDetailPage = lazy(() =>
  import('@/pages/vehicles/VehicleDetailPage').then((module) => ({
    default: module.VehicleDetailPage,
  })),
)

const RentalsPage = lazy(() =>
  import('@/pages/rentals/RentalsPage').then((module) => ({ default: module.RentalsPage })),
)
const RentalNewPage = lazy(() =>
  import('@/pages/rentals/RentalNewPage').then((module) => ({ default: module.RentalNewPage })),
)
const RentalDetailPage = lazy(() =>
  import('@/pages/rentals/RentalDetailPage').then((module) => ({
    default: module.RentalDetailPage,
  })),
)

const CalendarPage = lazy(() =>
  import('@/pages/calendar/CalendarPage').then((module) => ({ default: module.CalendarPage })),
)

const ExpensesPage = lazy(() =>
  import('@/pages/expenses/ExpensesPage').then((module) => ({ default: module.ExpensesPage })),
)
const ExpenseNewPage = lazy(() =>
  import('@/pages/expenses/ExpenseNewPage').then((module) => ({ default: module.ExpenseNewPage })),
)
const ExpenseDetailPage = lazy(() =>
  import('@/pages/expenses/ExpenseDetailPage').then((module) => ({
    default: module.ExpenseDetailPage,
  })),
)

const FinancingPage = lazy(() =>
  import('@/pages/financing/FinancingPage').then((module) => ({ default: module.FinancingPage })),
)
const FinancingNewPage = lazy(() =>
  import('@/pages/financing/FinancingNewPage').then((module) => ({
    default: module.FinancingNewPage,
  })),
)
const FinancingDetailPage = lazy(() =>
  import('@/pages/financing/FinancingDetailPage').then((module) => ({
    default: module.FinancingDetailPage,
  })),
)

const GpsTrackingPage = lazy(() =>
  import('@/pages/gps/GpsTrackingPage').then((module) => ({ default: module.GpsTrackingPage })),
)

const ReportsPage = lazy(() =>
  import('@/pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })),
)

const TeamPage = lazy(() =>
  import('@/pages/team/TeamPage').then((module) => ({ default: module.TeamPage })),
)

const BillingPage = lazy(() =>
  import('@/pages/billing/BillingPage').then((module) => ({ default: module.BillingPage })),
)
const BillingReturnPage = lazy(() =>
  import('@/pages/billing/BillingReturnPage').then((module) => ({
    default: module.BillingReturnPage,
  })),
)
const NotificationsPage = lazy(() =>
  import('@/pages/notifications/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
)

const CustomersPage = lazy(() =>
  import('@/pages/customers/CustomersPage').then((module) => ({ default: module.CustomersPage })),
)
const CustomerNewPage = lazy(() =>
  import('@/pages/customers/CustomerNewPage').then((module) => ({
    default: module.CustomerNewPage,
  })),
)
const CustomerDetailPage = lazy(() =>
  import('@/pages/customers/CustomerDetailPage').then((module) => ({
    default: module.CustomerDetailPage,
  })),
)

const SignInPage = lazy(() =>
  import('@/pages/auth/SignInPage').then((module) => ({ default: module.SignInPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage').then((module) => ({
    default: module.ResetPasswordPage,
  })),
)
const AuthCallbackPage = lazy(() =>
  import('@/pages/auth/AuthCallbackPage').then((module) => ({ default: module.AuthCallbackPage })),
)
const ConfirmEmailPage = lazy(() =>
  import('@/pages/auth/ConfirmEmailPage').then((module) => ({ default: module.ConfirmEmailPage })),
)
const AcceptInvitePage = lazy(() =>
  import('@/pages/auth/AcceptInvitePage').then((module) => ({
    default: module.AcceptInvitePage,
  })),
)
const CreateAgencyPage = lazy(() =>
  import('@/pages/onboarding/CreateAgencyPage').then((module) => ({
    default: module.CreateAgencyPage,
  })),
)

/*
 * The public marketing homepage. Shown at `paths.overview` ('/') only to a
 * signed-out visitor — see the `publicHome` branch in `RequireAuth`. It is its
 * own lazy chunk so visiting `/` signed out never downloads the authenticated
 * shell, its feature modules, or anything Reports/GPS/Financing pull in.
 */
const MarketingHomePage = lazy(() =>
  import('@/pages/marketplace/MarketplacePage').then((module) => ({
    default: module.MarketplacePage,
  })),
)
const PublicMarketplace = lazy(() =>
  import('@/pages/marketplace/MarketplacePage').then((m) => ({ default: m.MarketplacePage })),
)
const DashboardRedirect = lazy(() =>
  import('@/pages/marketplace/MarketplacePage').then((m) => ({ default: m.DashboardRedirect })),
)
const RegistrationPage = lazy(() =>
  import('@/pages/marketplace/RegistrationPage').then((m) => ({ default: m.RegistrationPage })),
)
const OfferDetailPage = lazy(() =>
  import('@/pages/marketplace/OfferDetailPage').then((m) => ({ default: m.OfferDetailPage })),
)
const ProviderPage = lazy(() =>
  import('@/pages/marketplace/OfferDetailPage').then((m) => ({ default: m.ProviderPage })),
)
const PricingPage = lazy(() =>
  import('@/pages/marketplace/PricingPage').then((m) => ({ default: m.PricingPage })),
)
const DashboardShell = lazy(() =>
  import('@/pages/marketplace/DashboardShell').then((m) => ({ default: m.DashboardShell })),
)
const MarketingPage = lazy(() =>
  import('@/pages/marketplace/CommercePages').then((m) => ({ default: m.MarketingPage })),
)
const ProviderOnboarding = lazy(() =>
  import('@/pages/marketplace/CommercePages').then((m) => ({ default: m.ProviderOnboarding })),
)
const CustomerDashboard = lazy(() =>
  import('@/pages/marketplace/CustomerDashboard').then((m) => ({ default: m.CustomerDashboard })),
)
const CustomerReviewsPage = lazy(() =>
  import('@/pages/marketplace/CustomerReviewsPage').then((m) => ({
    default: m.CustomerReviewsPage,
  })),
)
const AdminPage = lazy(() =>
  import('@/pages/marketplace/AdminPages').then((m) => ({ default: m.AdminPage })),
)
const ProviderDashboard = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.ProviderDashboard })),
)
const ProviderListings = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.ProviderListings })),
)
const ListingEditor = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.ListingEditor })),
)
const ProviderEnquiries = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.ProviderEnquiries })),
)
const CRMPage = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.CRMPage })),
)
const BusinessSettings = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.BusinessSettings })),
)
const BookingRequests = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.BookingRequests })),
)
const SubscriptionPage = lazy(() =>
  import('@/pages/marketplace/ProviderPages').then((m) => ({ default: m.SubscriptionPage })),
)
const OperationsPage = lazy(() =>
  import('@/pages/marketplace/OperationsPage').then((m) => ({ default: m.OperationsPage })),
)
const AdminConfigurationPage = lazy(() =>
  import('@/pages/marketplace/AdminConfigurationPage').then((m) => ({
    default: m.AdminConfigurationPage,
  })),
)

/** The permission that gates each not-yet-open section, taken from the nav model. */
const permissionForPath = new Map(
  navigationGroups.flatMap((group) => group.items.map((item) => [item.to, item.permission])),
)

export function AppRouter() {
  return (
    <Router>
      <Seo />
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<MarketingHomePage />} />
          <Route path="/cars" element={<PublicMarketplace service="dealership" />} />
          <Route path="/rentals" element={<PublicMarketplace service="rental" />} />
          <Route path="/cars/:slug" element={<OfferDetailPage service="dealership" />} />
          <Route path="/rentals/:slug" element={<OfferDetailPage service="rental" />} />
          <Route path="/providers/:slug" element={<ProviderPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route path="/register/customer" element={<RegistrationPage />} />
          <Route path="/register/business" element={<RegistrationPage business />} />
          <Route element={<DashboardShell mode="admin" />}>
            <Route path="/admin/marketing" element={<MarketingPage admin />} />
            <Route path="/admin/promotions" element={<MarketingPage admin />} />
            {(['brands', 'categories', 'content', 'users', 'fleet'] as const).map((module) => (
              <Route
                key={module}
                path={`/admin/${module}`}
                element={<AdminConfigurationPage module={module} />}
              />
            ))}
            {(
              ['orders', 'test-drives', 'financing', 'reviews', 'support', 'contacts'] as const
            ).map((kind) => (
              <Route
                key={kind}
                path={`/admin/${kind}`}
                element={<OperationsPage kind={kind} admin />}
              />
            ))}
            <Route path="/admin/:module" element={<AdminPage />} />
          </Route>
          <Route element={<DashboardShell mode="customer" />}>
            <Route path="/provider/onboarding" element={<ProviderOnboarding />} />
            {(['orders', 'test-drives', 'financing', 'support'] as const).map((kind) => (
              <Route
                key={kind}
                path={`/customer/${kind}`}
                element={<OperationsPage kind={kind} customer />}
              />
            ))}
            <Route path="/customer/reviews" element={<CustomerReviewsPage />} />
            <Route path="/customer/:module" element={<CustomerDashboard />} />
          </Route>
          <Route element={<DashboardShell mode="dealership" />}>
            <Route path="/seller/promotions" element={<MarketingPage service="dealership" />} />
            {(
              ['orders', 'test-drives', 'financing', 'reviews', 'support', 'contacts'] as const
            ).map((kind) => (
              <Route key={kind} path={`/seller/${kind}`} element={<OperationsPage kind={kind} />} />
            ))}
            <Route path="/seller/dashboard" element={<ProviderDashboard service="dealership" />} />
            <Route path="/seller/listings" element={<ProviderListings service="dealership" />} />
            <Route path="/seller/listings/new" element={<ListingEditor service="dealership" />} />
            <Route
              path="/seller/listings/:id/edit"
              element={<ListingEditor service="dealership" />}
            />
            <Route path="/seller/enquiries" element={<ProviderEnquiries service="dealership" />} />
            <Route path="/seller/crm" element={<CRMPage service="dealership" />} />
            <Route path="/seller/settings" element={<BusinessSettings />} />
            <Route path="/seller/subscription" element={<SubscriptionPage />} />
          </Route>
          <Route element={<DashboardShell mode="rental" />}>
            <Route
              path="/rental/marketplace/promotions"
              element={<MarketingPage service="rental" />}
            />
            {(['reviews', 'support', 'contacts'] as const).map((kind) => (
              <Route
                key={kind}
                path={`/rental/marketplace/${kind}`}
                element={<OperationsPage kind={kind} />}
              />
            ))}
            <Route
              path="/rental/marketplace/dashboard"
              element={<ProviderDashboard service="rental" />}
            />
            <Route
              path="/rental/marketplace/listings"
              element={<ProviderListings service="rental" />}
            />
            <Route
              path="/rental/marketplace/listings/new"
              element={<ListingEditor service="rental" />}
            />
            <Route
              path="/rental/marketplace/listings/:id/edit"
              element={<ListingEditor service="rental" />}
            />
            <Route
              path="/rental/marketplace/enquiries"
              element={<ProviderEnquiries service="rental" />}
            />
            <Route path="/rental/marketplace/reservations" element={<BookingRequests />} />
            <Route path="/rental/marketplace/crm" element={<CRMPage service="rental" />} />
            <Route path="/rental/marketplace/settings" element={<BusinessSettings />} />
            <Route path="/rental/marketplace/subscription" element={<SubscriptionPage />} />
          </Route>
          <Route path="/rentals/new" element={<Navigate to={paths.rentalNew} replace />} />
          <Route path="/vehicles" element={<Navigate to={paths.vehicles} replace />} />
          <Route path="/vehicles/new" element={<Navigate to={paths.vehicleNew} replace />} />
          {/* Unauthenticated */}
          <Route element={<RequireAnonymous />}>
            <Route path={paths.signIn} element={<SignInPage />} />
            <Route path={paths.signUp} element={<RegistrationPage />} />
            <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
          </Route>

          {/* Reachable in either state: these establish or complete a session. */}
          <Route path={paths.authCallback} element={<AuthCallbackPage />} />
          <Route path={paths.resetPassword} element={<ResetPasswordPage />} />
          <Route path={paths.confirmEmail} element={<ConfirmEmailPage />} />

          {/*
           * Invitation acceptance sits outside every guard, and has to.
           *
           * RequireAuth would bounce a signed-out invitee to the sign-in screen
           * and lose the fragment carrying their token on the way. RequireOrganization
           * would send an invited person with no membership yet to onboarding —
           * which is the exact accident this module exists to prevent: being made
           * to create an agency of your own before you are allowed to join one.
           * The page handles all three arrival states itself, and the token grants
           * nothing until the database has checked it.
           */}
          <Route path={paths.acceptInvite} element={<AcceptInvitePage />} />

          {/* Authenticated — except `/`, which a signed-out visitor sees the
              public marketing page for instead of being sent to sign in. */}
          <Route element={<RequireAuth />}>
            <Route element={<WithWorkspace />}>
              <Route element={<RequireNoOrganization />}>
                <Route path={paths.createAgency} element={<CreateAgencyPage />} />
              </Route>

              <Route element={<RequireOrganization />}>
                <Route element={<RequireRentalService />}>
                  <Route element={<AppShell />}>
                    <Route path={paths.overview} element={<Navigate to="/rental/marketplace/dashboard" replace />} />
                    <Route path={paths.settings} element={<SettingsPage />} />

                    {/* Fleet. Creation is gated separately from viewing, so staff
                      can look up a vehicle without being offered Add. */}
                    <Route element={<RequirePermission permission="vehicles.view" />}>
                      <Route path={paths.vehicles} element={<VehiclesPage />} />
                      <Route path={paths.vehicleDetail} element={<VehicleDetailPage />} />
                      <Route element={<RequirePermission permission="vehicles.create" />}>
                        <Route path={paths.vehicleNew} element={<VehicleNewPage />} />
                      </Route>
                    </Route>

                    {/* Tracking. Viewing sits with the manager, not the desk: a
                      vehicle's position during an active rental is a customer's
                      movements. Connecting a provider and assigning a device are
                      gated separately again, inside the page. */}
                    <Route element={<RequirePermission permission="gps.view" />}>
                      <Route path={paths.gpsTracking} element={<GpsTrackingPage />} />
                    </Route>

                    {/* Rentals. Viewing is gated separately from creating, so a
                      read-only role can look a contract up without being
                      offered New rental. */}
                    <Route element={<RequirePermission permission="rentals.view" />}>
                      <Route path={paths.rentals} element={<RentalsPage />} />
                      <Route path={paths.rentalDetail} element={<RentalDetailPage />} />
                      <Route element={<RequirePermission permission="rentals.create" />}>
                        <Route path={paths.rentalNew} element={<RentalNewPage />} />
                      </Route>

                      {/* The Calendar reads the same rentals under the same
                        permission: it is a view over the domain, not a second
                        way into it. */}
                      <Route path={paths.calendar} element={<CalendarPage />} />
                    </Route>

                    {/* Customers. Viewing is gated separately from creating, so
                      a read-only role can look somebody up without being
                      offered Add. */}
                    <Route element={<RequirePermission permission="customers.view" />}>
                      <Route path={paths.customers} element={<CustomersPage />} />
                      <Route path={paths.customerDetail} element={<CustomerDetailPage />} />
                      <Route element={<RequirePermission permission="customers.create" />}>
                        <Route path={paths.customerNew} element={<CustomerNewPage />} />
                      </Route>
                    </Route>

                    {/* Costs. Reading the ledger is what most of the desk needs;
                      recording one is a separate permission again. */}
                    <Route element={<RequirePermission permission="expenses.view" />}>
                      <Route path={paths.expenses} element={<ExpensesPage />} />
                      <Route path={paths.expenseDetail} element={<ExpenseDetailPage />} />
                      <Route element={<RequirePermission permission="expenses.create" />}>
                        <Route path={paths.expenseNew} element={<ExpenseNewPage />} />
                      </Route>
                    </Route>

                    {/* Financing. Viewing is a manager's; recording an agreement
                      or a lender payment is an administrator's, because both
                      move a balance the agency owes. */}
                    <Route element={<RequirePermission permission="financing.view" />}>
                      <Route path={paths.financing} element={<FinancingPage />} />
                      <Route path={paths.financingDetail} element={<FinancingDetailPage />} />
                      <Route element={<RequirePermission permission="financing.create" />}>
                        <Route path={paths.financingNew} element={<FinancingNewPage />} />
                      </Route>
                    </Route>

                    {/* Reports. A manager's, like Financing and Tracking: it
                      combines financial, customer and location data, and the
                      front desk needs none of it. */}
                    <Route element={<RequirePermission permission="reports.view" />}>
                      <Route path={paths.reports} element={<ReportsPage />} />
                    </Route>

                    {/* Notifications. No permission of its own: the feed decides
                      per category what this member may be told, so the page is
                      safe for anybody with a membership and shows each person a
                      different list. */}
                    <Route path={paths.notifications} element={<NotificationsPage />} />

                    {/* Team. Every member may see who else is here; the actions
                      that change membership are gated inside the page and, far
                      more importantly, in the database. */}
                    <Route element={<RequirePermission permission="team.view" />}>
                      <Route path={paths.team} element={<TeamPage />} />
                    </Route>

                    {/* Billing. Owner-only, and the database says so too: an
                      administrator who types the URL is refused by
                      billing_overview, not by a missing menu entry. */}
                    <Route element={<RequirePermission permission="billing.manage" />}>
                      <Route path={paths.billing} element={<BillingPage />} />
                      <Route path={paths.billingReturn} element={<BillingReturnPage />} />
                    </Route>

                    {upcomingModules.map(({ path, ...module }) => {
                      const permission = permissionForPath.get(path)
                      const element = <ModulePage {...module} />

                      return permission ? (
                        <Route key={path} element={<RequirePermission permission={permission} />}>
                          <Route path={path} element={element} />
                        </Route>
                      ) : (
                        <Route key={path} path={path} element={element} />
                      )
                    })}

                    {/*
                     * The catch-all lives inside the shell rather than at the top
                     * level, so an unknown path is still subject to RequireAuth:
                     * a signed-out visitor is sent to sign in, a signed-in one
                     * gets a not-found page with navigation still around them.
                     */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </Router>
  )
}
