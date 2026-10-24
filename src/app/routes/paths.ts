/**
 * Every route in the product, in one place.
 *
 * Route strings are never written inline elsewhere — a renamed section should be
 * a one-line change here, not a search across the codebase.
 */
export const paths = {
  overview: '/rental/marketplace/dashboard',

  rentals: '/rental/reservations',
  rentalNew: '/rental/reservations/new',
  /** Detail route; build with `rentalDetailPath(id)`. */
  rentalDetail: '/rental/reservations/:rentalId',
  calendar: '/rental/calendar',
  customers: '/rental/customers',
  customerNew: '/rental/customers/new',
  /** Detail route; build with `customerDetailPath(id)`. */
  customerDetail: '/rental/customers/:customerId',

  vehicles: '/rental/fleet',
  vehicleNew: '/rental/fleet/new',
  /** Detail route; build with `vehicleDetail(id)`. */
  vehicleDetail: '/rental/fleet/:vehicleId',
  gpsTracking: '/rental/gps-tracking',

  expenses: '/expenses',
  expenseNew: '/expenses/new',
  /** Detail route; build with `expenseDetailPath(id)`. */
  expenseDetail: '/expenses/:expenseId',
  financing: '/financing',
  financingNew: '/financing/new',
  /** Detail route; build with `financingDetailPath(id)`. */
  financingDetail: '/financing/:financingId',
  reports: '/reports',

  notifications: '/notifications',
  team: '/team',
  billing: '/billing',
  billingReturn: '/billing/return',
  settings: '/settings',

  signIn: '/sign-in',
  signUp: '/sign-up',
  forgotPassword: '/forgot-password',
  resetPassword: '/auth/reset-password',
  authCallback: '/auth/callback',
  confirmEmail: '/confirm-email',
  /** Carries its token in the URL fragment, never the query string. */
  acceptInvite: '/accept-invite',
  createAgency: '/welcome',
} as const

export type AppPath = (typeof paths)[keyof typeof paths]

export function vehicleDetailPath(vehicleId: string): string {
  return `/rental/fleet/${vehicleId}`
}

export function customerDetailPath(customerId: string): string {
  return `/rental/customers/${customerId}`
}

export function rentalDetailPath(rentalId: string): string {
  return `/rental/reservations/${rentalId}`
}

export function expenseDetailPath(expenseId: string): string {
  return `/expenses/${expenseId}`
}

export function financingDetailPath(agreementId: string): string {
  return `/financing/${agreementId}`
}
