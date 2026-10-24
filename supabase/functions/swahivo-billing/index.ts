import { createClient } from 'jsr:@supabase/supabase-js@2.118.0'

// No browser key or caller-supplied amount is used as payment authority.
Deno.serve(async (request: Request) => {
  const origin = Deno.env.get('SWAHIVO_APP_URL') ?? Deno.env.get('BILLING_APP_URL')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' }
  if (origin && request.headers.get('Origin') === new URL(origin).origin) {
    headers['Access-Control-Allow-Origin'] = new URL(origin).origin
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405)
  if (!origin)
    return json({ error: 'Billing return URL is not configured. Set SWAHIVO_APP_URL.' }, 503)
  if (request.headers.get('Origin') && request.headers.get('Origin') !== new URL(origin).origin)
    return json({ error: 'Origin not permitted.' }, 403)
  const url = Deno.env.get('SUPABASE_URL')!,
    anon = Deno.env.get('SUPABASE_ANON_KEY')!,
    serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const auth = await caller.auth.getUser()
  if (auth.error || !auth.data.user) return json({ error: 'Sign in required.' }, 401)
  const admin = createClient(url, serverKey, { auth: { persistSession: false } })
  try {
    const body = (await request.json()) as { organization_id?: string; package_id?: string }
    const membership = await admin
      .from('organization_members')
      .select('role,status')
      .eq('organization_id', body.organization_id)
      .eq('user_id', auth.data.user.id)
      .maybeSingle()
    if (
      membership.error ||
      membership.data?.role !== 'owner' ||
      membership.data.status !== 'active'
    )
      return json({ error: 'Business owner permission required.' }, 403)
    const plan = await admin
      .from('service_packages')
      .select('*')
      .eq('id', body.package_id)
      .eq('published', true)
      .single()
    if (plan.error || !plan.data) return json({ error: 'Package not available.' }, 400)
    const access = await admin
      .from('business_service_access')
      .select('service')
      .eq('organization_id', body.organization_id)
      .eq('service', plan.data.service)
      .maybeSingle()
    if (access.error || !access.data)
      return json({ error: 'Business is not approved for this service.' }, 403)
    if (plan.data.monthly_tzs === 0)
      return json(
        { error: 'The Free dealership allowance is already available after approval.' },
        400,
      )
    const secret = Deno.env.get('BILLING_STRIPE_SECRET_KEY')
    if (!secret || !plan.data.stripe_price_id || plan.data.monthly_tzs === null)
      return json(
        { error: 'Payments are not configured for this package. No payment has been taken.' },
        503,
      )
    const stripeHeaders = { Authorization: `Bearer ${secret}` }
    const response = await fetch(
      `https://api.stripe.com/v1/prices/${encodeURIComponent(plan.data.stripe_price_id)}`,
      { headers: stripeHeaders },
    )
    const price = await response.json()
    const live = !secret.startsWith('sk_test_') && !secret.startsWith('rk_test_')
    if (
      !response.ok ||
      !price.active ||
      price.livemode !== live ||
      price.currency !== 'tzs' ||
      price.unit_amount !== Number(plan.data.monthly_tzs) * 100 ||
      price.recurring?.interval !== 'month' ||
      price.recurring?.interval_count !== 1
    )
      return json(
        { error: 'The configured Stripe price does not match this monthly TZS package.' },
        503,
      )
    const returnPath =
      plan.data.service === 'rental' ? '/rental/marketplace/subscription' : '/seller/subscription'
    const form = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': plan.data.stripe_price_id,
      'line_items[0][quantity]': '1',
      success_url: new URL(`${returnPath}?checkout=returned`, origin).href,
      cancel_url: new URL(`${returnPath}?checkout=cancelled`, origin).href,
      client_reference_id: body.organization_id!,
      customer_email: auth.data.user.email ?? '',
      'metadata[swahivo_organization_id]': body.organization_id!,
      'metadata[swahivo_package_id]': plan.data.id,
    })
    const checkoutResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        ...stripeHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `swahivo:${body.organization_id}:${plan.data.id}:${Math.floor(Date.now() / 300000)}`,
      },
      body: form,
    })
    const checkout = await checkoutResponse.json()
    if (
      !checkoutResponse.ok ||
      typeof checkout.id !== 'string' ||
      typeof checkout.url !== 'string' ||
      new URL(checkout.url).hostname !== 'checkout.stripe.com'
    )
      return json(
        { error: 'Stripe could not start checkout. No subscription has been activated.' },
        502,
      )
    const saved = await admin
      .from('marketplace_checkout_sessions')
      .upsert({
        id: checkout.id,
        organization_id: body.organization_id,
        package_id: plan.data.id,
        service: plan.data.service,
        live_mode: live,
      })
    if (saved.error)
      return json(
        { error: 'Checkout could not be recorded. No subscription has been activated.' },
        500,
      )
    return json({ url: checkout.url })
  } catch {
    return json(
      { error: 'Billing request could not be completed. No subscription has been activated.' },
      500,
    )
  }
})
