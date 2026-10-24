import { createClient } from 'jsr:@supabase/supabase-js@2.118.0'
import { verifyStripeSignature } from '../_shared/stripe-signature.ts'

Deno.serve(async (request: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json({ error: 'POST required.' }, 405)
  const secret = Deno.env.get('BILLING_STRIPE_SECRET_KEY'),
    signing = Deno.env.get('SWAHIVO_COMMERCE_WEBHOOK_SECRET')
  if (!secret || !signing) return json({ error: 'Commerce webhook is not configured.' }, 503)
  const raw = await request.text()
  if (raw.length > 1048576) return json({ error: 'Payload too large.' }, 413)
  if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), signing)).ok)
    return json({ error: 'Invalid signature.' }, 400)
  try {
    const event = JSON.parse(raw),
      live = !secret.startsWith('sk_test_') && !secret.startsWith('rk_test_')
    if (event.livemode !== live) return json({ error: 'Payment mode mismatch.' }, 400)
    if (
      !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
        event.type,
      )
    )
      return json({ received: true, ignored: true })
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(event.data.object.id)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
    if (!response.ok) throw Error('Checkout unavailable')
    const checkout = await response.json()
    if (checkout.mode !== 'payment' || checkout.payment_status !== 'paid')
      return json({ received: true, activated: false })
    if (checkout.livemode !== live || checkout.currency !== 'tzs')
      return json({ error: 'Checkout mismatch.' }, 400)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const order = await admin
      .from('marketplace_payment_orders')
      .select('id')
      .eq('checkout_id', checkout.id)
      .maybeSingle()
    if (order.error) throw order.error
    if (!order.data) return json({ received: true, unrelated: true })
    const applied = await admin.rpc('marketplace_settle_checkout', {
      p_id: order.data.id,
      p_checkout: checkout.id,
      p_reference: checkout.payment_intent ?? event.id,
      p_amount: checkout.amount_total,
      p_currency: 'TZS',
    })
    if (applied.error) throw applied.error
    return json({ received: true })
  } catch {
    return json({ error: 'Verified payment could not be applied; retry required.' }, 500)
  }
})
