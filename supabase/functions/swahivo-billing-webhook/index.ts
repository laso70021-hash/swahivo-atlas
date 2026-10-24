import { createClient } from 'jsr:@supabase/supabase-js@2.118.0'
import { verifyStripeSignature } from '../_shared/stripe-signature.ts'

Deno.serve(async (request: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405)
  const signingSecret = Deno.env.get('SWAHIVO_STRIPE_WEBHOOK_SECRET'),
    stripeSecret = Deno.env.get('BILLING_STRIPE_SECRET_KEY')
  if (!signingSecret || !stripeSecret)
    return json({ error: 'Swahivo payment webhook is not configured.' }, 503)
  const raw = await request.text()
  if (raw.length > 1048576) return json({ error: 'Payload too large.' }, 413)
  if (
    !(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), signingSecret)).ok
  )
    return json({ error: 'Invalid webhook signature.' }, 400)
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const stripe = async (path: string) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${stripeSecret}` },
    })
    if (!response.ok) throw Error('Stripe retrieval failed')
    return response.json()
  }
  try {
    const event = JSON.parse(raw)
    if (!event.id || !event.type) return json({ error: 'Invalid event.' }, 400)
    const live = !stripeSecret.startsWith('sk_test_') && !stripeSecret.startsWith('rk_test_')
    if (event.livemode !== live) return json({ error: 'Stripe mode mismatch.' }, 400)
    let checkoutId: string | undefined, subscriptionId: string | undefined
    if (
      ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
        event.type,
      )
    ) {
      const checkout = await stripe(`checkout/sessions/${encodeURIComponent(event.data.object.id)}`)
      if (checkout.mode !== 'subscription' || checkout.payment_status !== 'paid')
        return json({ received: true, activated: false })
      checkoutId = checkout.id
      subscriptionId =
        typeof checkout.subscription === 'string'
          ? checkout.subscription
          : checkout.subscription?.id
    } else if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = event.data.object.id
    } else if (['invoice.paid', 'invoice.payment_failed'].includes(event.type)) {
      subscriptionId =
        event.data.object.subscription ??
        event.data.object.parent?.subscription_details?.subscription
    } else return json({ received: true, ignored: true })
    if (!subscriptionId) return json({ received: true, ignored: true })
    let lookup = admin.from('marketplace_checkout_sessions').select('*')
    lookup = checkoutId
      ? lookup.eq('id', checkoutId)
      : lookup.eq('stripe_subscription_id', subscriptionId)
    const record = await lookup.maybeSingle()
    if (record.error) throw record.error
    if (!record.data) return json({ received: true, unrelated: true })
    if (record.data.live_mode !== live) return json({ error: 'Checkout mode mismatch.' }, 400)
    const subscription = await stripe(
      `subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`,
    )
    const plan = await admin
      .from('service_packages')
      .select('*')
      .eq('id', record.data.package_id)
      .single()
    if (plan.error) throw plan.error
    const item = subscription.items?.data?.[0]
    if (
      !item ||
      subscription.items.data.length !== 1 ||
      item.price.id !== plan.data.stripe_price_id ||
      item.price.currency !== 'tzs' ||
      item.price.unit_amount !== Number(plan.data.monthly_tzs) * 100 ||
      subscription.livemode !== live
    )
      return json({ error: 'Subscription package mismatch.' }, 400)
    const periodEnd = item.current_period_end ?? subscription.current_period_end
    if (!Number.isFinite(periodEnd)) throw Error('Subscription period unavailable')
    const invoice = subscription.latest_invoice
    const status =
      subscription.status === 'active' && invoice?.status === 'paid'
        ? 'active'
        : ['canceled', 'incomplete_expired'].includes(subscription.status)
          ? 'cancelled'
          : 'expired'
    const applied = await admin.rpc('marketplace_apply_billing_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_checkout_id: record.data.id,
      p_subscription_id: subscriptionId,
      p_status: status,
      p_expires_at: new Date(periodEnd * 1000).toISOString(),
      p_payment_reference: invoice?.id ?? event.id,
    })
    if (applied.error) throw applied.error
    return json({ received: true, status })
  } catch {
    return json({ error: 'Verified event could not be applied; Stripe should retry.' }, 500)
  }
})
