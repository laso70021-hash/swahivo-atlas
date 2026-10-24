import type { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/auth-context'
import { getSupabaseClient } from '@/lib/supabase/client'

export type ServiceType = 'dealership' | 'rental'
export function fieldText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
export type Business = {
  organization_id: string
  name: string
  slug: string
  city: string
  region: string
  address: string
  description: string
  whatsapp_number_e164: string | null
  whatsapp_enabled: boolean
  business_phone: string | null
  logo_path: string | null
  banner_path: string | null
  services: ServiceType[]
}
export type Application = {
  id: string
  applicant_id: string
  business_name: string
  requested_services: ServiceType[]
  status: string
  city: string
  region: string
  country_code: string
  business_phone: string
  whatsapp_number_e164: string | null
  address: string
  description: string
  registration_number: string | null
  decision_note: string | null
  created_at: string
}
export type Offer = {
  test_drives_available?: boolean
  financing_available?: boolean
  rental_terms?: string
  id: string
  organization_id: string
  slug: string
  service: ServiceType
  title: string
  make: string
  model: string
  model_year: number
  condition: string
  category: string
  price_minor: number
  currency: string
  mileage: number
  transmission: string
  fuel_type: string
  seats: number
  location: string
  description: string
  images: string[]
  image_urls?: string[]
  status: string
  featured: boolean
  vehicle_id: string | null
  self_drive: boolean
  chauffeur: boolean
  deposit_minor: number
  business_name: string
  business_slug: string
  whatsapp_number_e164: string | null
  whatsapp_enabled: boolean
  business_phone: string | null
  created_at: string
}
export type Enquiry = {
  id: string
  organization_id: string
  offer_id: string
  customer_id: string
  service: ServiceType
  message: string
  status: string
  customer_name: string
  contact_email: string
  created_at: string
}
export type Reservation = {
  id: string
  organization_id: string
  offer_id: string
  customer_id: string
  rental_id: string | null
  starts_at: string
  ends_at: string
  pickup_location: string
  return_location: string
  driver_name: string
  status: string
  total_minor: number
  deposit_minor: number
  currency: string
  created_at: string
}
export type Lead = {
  id: string
  organization_id: string
  service: ServiceType
  name: string
  email: string | null
  phone: string | null
  stage: string
  source: string
  notes: string | null
  assigned_to: string | null
  follow_up_at: string | null
  created_at: string
}
export type Package = {
  included_ad_days: number
  id: string
  service: ServiceType
  name: string
  monthly_tzs: number | null
  listing_limit: number | null
  published: boolean
  stripe_price_id: string | null
  features: string[]
}
export type Account = { is_admin: boolean; businesses: Business[]; applications: Application[] }
export type OperationalRecord = {
  id: string
  organization_id: string
  status: string
  created_at: string
  [field: string]: unknown
}
type Table<R extends Record<string, unknown>> = {
  Row: R
  Insert: Partial<R>
  Update: Partial<R>
  Relationships: []
}
type Db = {
  public: {
    Tables: {
      marketplace_plan_selections: Table<PlanSelection>
      marketplace_payment_orders: Table<PaymentOrder>
      marketplace_ad_placements: Table<AdPlacement>
      marketplace_campaigns: Table<Campaign>
      business_service_access: Table<{
        organization_id: string
        service: ServiceType
        approved_at: string
      }>
      marketplace_businesses: Table<Business>
      business_applications: Table<Application>
      marketplace_offers: Table<Offer>
      marketplace_enquiries: Table<Enquiry>
      marketplace_reservations: Table<Reservation>
      crm_leads: Table<Lead>
      service_packages: Table<Package>
      marketplace_subscriptions: Table<{
        organization_id: string
        service: ServiceType
        package_id: string
        status: string
        expires_at: string | null
        provider: string
      }>
      marketplace_configuration: Table<{
        id: string
        kind: string
        name: string
        description: string
        published: boolean
        created_at: string
      }>
      marketplace_orders: Table<OperationalRecord>
      marketplace_test_drives: Table<OperationalRecord>
      marketplace_finance_requests: Table<OperationalRecord>
      marketplace_support_tickets: Table<OperationalRecord>
      marketplace_promotions: Table<OperationalRecord>
      marketplace_reviews: Table<OperationalRecord>
      marketplace_contact_events: Table<OperationalRecord>
      marketplace_favorites: Table<{ user_id: string; offer_id: string; created_at: string }>
      crm_activities: Table<{
        id: string
        organization_id: string
        lead_id: string
        note: string
        created_at: string
      }>
      crm_tasks: Table<{
        id: string
        organization_id: string
        lead_id: string
        title: string
        due_at: string
        completed: boolean
      }>
    }
    Views: { marketplace_catalogue: Table<Offer> }
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
// This is a schema extension over the application's ONE memoised browser client.
export function marketplaceClient() {
  return getSupabaseClient() as unknown as SupabaseClient<Db>
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await marketplaceClient().rpc(name, args)
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}
export function useMarketplaceAccount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['swahivo', 'account', user?.id],
    queryFn: () => rpc<Account>('marketplace_account'),
    enabled: !!user,
  })
}
export function useMarketplaceRealtime() {
  const { user } = useAuth()
  const cache = useQueryClient()
  useEffect(() => {
    if (!user) return
    const channel = getSupabaseClient().channel(`swahivo-updates-${user.id}`)
    for (const table of ['marketplace_enquiries', 'marketplace_reservations', 'crm_leads']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        void cache.invalidateQueries({ queryKey: ['swahivo'] })
      })
    }
    channel.subscribe()
    return () => {
      void getSupabaseClient().removeChannel(channel)
    }
  }, [user, cache])
}
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s()+.-]/g, '')
  const normalized = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('0') && digits.length === 10
      ? `255${digits.slice(1)}`
      : digits
  return /^[1-9]\d{7,14}$/.test(normalized) ? `+${normalized}` : null
}
export function whatsappUrl(offer: Offer, from?: string, to?: string): string | null {
  const number =
    offer.whatsapp_enabled && offer.whatsapp_number_e164
      ? normalizePhone(offer.whatsapp_number_e164)
      : null
  if (!number) return null
  const link = new URL(
    `/${offer.service === 'rental' ? 'rentals' : 'cars'}/${offer.slug}`,
    window.location.origin,
  ).href
  const message =
    offer.service === 'rental'
      ? `Hello, I found your ${offer.title} on Swahivo Car Rental. I would like to enquire about availability${from && to ? ` from ${from} to ${to}` : ''}. Vehicle link: ${link}`
      : `Hello, I found your ${offer.title} on Swahivo Car Dealership. I would like to know if it is still available. Vehicle link: ${link}`
  return `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(message)}`
}
export const money = (minor: number, currency = 'TZS') =>
  new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'TZS' ? 0 : 2,
  }).format(minor / 100)
export async function withPhotos(offers: Offer[]): Promise<Offer[]> {
  return Promise.all(
    offers.map(async (offer) => ({
      ...offer,
      image_urls: await Promise.all(
        (offer.images ?? []).map(async (image) => {
          const result = await marketplaceClient()
            .storage.from('marketplace-media')
            .createSignedUrl(image, 3600)
          return result.data?.signedUrl ?? ''
        }),
      ),
    })),
  )
}
export async function listOffers(
  service: ServiceType,
  params: URLSearchParams = new URLSearchParams(),
): Promise<Offer[]> {
  let query = marketplaceClient()
    .from('marketplace_catalogue')
    .select('*')
    .eq('service', service)
    .order('created_at', { ascending: false })
    .limit(100)
  for (const field of ['make', 'condition', 'category', 'location'] as const) {
    const value = params.get(field)
    if (value) query = query.ilike(field, `%${value.replace(/[%_]/g, '')}%`)
  }
  if (params.get('model'))
    query = query.ilike('model', `%${params.get('model')!.replace(/[%_]/g, '')}%`)
  const maximum = Number(params.get('maxPrice'))
  if (maximum > 0) query = query.lte('price_minor', Math.round(maximum * 100))
  const result = await query
  if (result.error) throw new Error(result.error.message)
  let rows = result.data ?? []
  if (service === 'rental' && params.get('from') && params.get('to')) {
    const available = await rpc<string[]>('marketplace_available_offers', {
      p_from: new Date(params.get('from')!).toISOString(),
      p_to: new Date(params.get('to')!).toISOString(),
    })
    rows = rows.filter((row) => available.includes(row.id))
  }
  return withPhotos(rows)
}

export type PlanSelection = {
  id: string
  application_id: string
  service: ServiceType
  package_id: string
  amount_minor: number
  status: string
}
export type PaymentOrder = {
  id: string
  user_id: string
  selection_id: string | null
  campaign_id: string | null
  amount_minor: number
  currency: string
  status: string
  payment_reference: string | null
  created_at: string
}
export type AdPlacement = {
  id: string
  name: string
  description: string
  price_daily_minor: number | null
  enabled: boolean
  allow_plan_credit: boolean
  max_days: number
}
export type Campaign = {
  id: string
  organization_id: string
  service: ServiceType
  placement_id: string
  offer_id: string | null
  title: string
  description: string
  image_path: string | null
  starts_at: string
  ends_at: string
  days: number
  amount_minor: number
  payment_status: string
  status: string
  review_note: string | null
  created_at: string
}
export type CampaignStat = { id: string; impressions: number; clicks: number }
export type Advertisement = {
  id: string
  title: string
  description: string
  business_name: string
  destination: string
  display_image: string | null
  image_bucket: string
  image_url?: string
}
export async function startCommerceCheckout(paymentId: string) {
  const result = await marketplaceClient().functions.invoke('swahivo-commerce', {
    body: { payment_id: paymentId },
  })
  if (result.error) {
    const context = (result.error as { context?: Response }).context
    const body = context ? ((await context.clone().json()) as { error?: string }) : null
    throw new Error(body?.error ?? 'Checkout is unavailable. Contact Swahivo support.')
  }
  const url = fieldText((result.data as { url?: unknown } | null)?.url)
  if (new URL(url).hostname !== 'checkout.stripe.com' || new URL(url).protocol !== 'https:')
    throw new Error('Invalid checkout address.')
  window.location.assign(url)
}
