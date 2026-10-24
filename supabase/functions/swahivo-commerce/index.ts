import { createClient } from 'jsr:@supabase/supabase-js@2.118.0'

Deno.serve(async (request: Request) => {
  const origin = Deno.env.get('SWAHIVO_APP_URL')
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
  if (!origin) return json({ error: 'Payment return URL is not configured.' }, 503)
  if (request.headers.get('Origin') && request.headers.get('Origin') !== new URL(origin).origin)
    return json({ error: 'Origin not permitted.' }, 403)
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const auth = await caller.auth.getUser()
  if (auth.error || !auth.data.user) return json({ error: 'Sign in required.' }, 401)
  try {
    const body = await request.json()
    const order = await caller
      .from('marketplace_payment_orders')
      .select('*')
      .eq('id', body.payment_id)
      .eq('user_id', auth.data.user.id)
      .single()
    if (order.error || order.data.status !== 'pending')
      return json({ error: 'Your pending payment order is required.' }, 403)
    const secret = Deno.env.get('BILLING_STRIPE_SECRET_KEY')
    if (!secret)
      return json(
        {
          error:
            'Online payments are not configured. Your account or campaign remains on hold. Contact Swahivo support for payment instructions.',
        },
        503,
      )
    const stripeHeaders = { Authorization: `Bearer ${secret}` }
    // Reuse an open checkout; never issue two payable sessions for the same order.
    if (order.data.checkout_id) {
      const response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.data.checkout_id)}`,
        { headers: stripeHeaders },
      )
      const existing = await response.json()
      if (response.ok && existing.status === 'open' && existing.url)
        return json({ url: existing.url })
      return json(
        {
          error:
            'This checkout is completed or expired. Contact support to reconcile the order before retrying.',
        },
        409,
      )
    }
    const returnPath = order.data.selection_id ? '/provider/onboarding' : '/dashboard'
    const form = new URLSearchParams({
      mode: 'payment',
      client_reference_id: order.data.id,
      customer_email: auth.data.user.email ?? '',
      success_url: new URL(`${returnPath}?payment=returned`, origin).href,
      cancel_url: new URL(`${returnPath}?payment=cancelled`, origin).href,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'tzs',
      'line_items[0][price_data][unit_amount]': String(order.data.amount_minor),
      'line_items[0][price_data][product_data][name]': order.data.selection_id
        ? 'Swahivo provider plan — initial 30 days'
        : 'Swahivo advertising campaign',
      'metadata[swahivo_payment_id]': order.data.id,
    })
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        ...stripeHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `swahivo-order:${order.data.id}`,
      },
      body: form,
    })
    const checkout = await response.json()
    if (
      !response.ok ||
      typeof checkout.url !== 'string' ||
      new URL(checkout.url).hostname !== 'checkout.stripe.com'
    )
      return json({ error: 'Checkout could not start. No access has been activated.' }, 502)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const saved = await admin
      .from('marketplace_payment_orders')
      .update({ checkout_id: checkout.id })
      .eq('id', order.data.id)
      .eq('status', 'pending')
      .select('id')
    if (saved.error || saved.data?.length !== 1)
      return json({ error: 'Payment order changed. Contact support.' }, 409)
    return json({ url: checkout.url })
  } catch {
    return json({ error: 'Payment request could not be completed.' }, 500)
  }
})
