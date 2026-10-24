// @vitest-environment node
/**
 * Fleet occupancy follows the rental lifecycle, not the clock.
 *
 * A car is out from check-out until the rental is completed. Before
 * 20260825100000 the read models only counted an active rental between its
 * scheduled start and end, so a car handed over early, or kept past its return
 * time, showed as available while a customer had it.
 *
 * Every period here is relative to now(), because that is what the views
 * compare against. Each scenario has its own vehicle and customer so one cannot
 * explain another's result.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TestDatabase, signUp } from './support/harness'

let db: TestDatabase
let ownerId: string
let organizationId: string
let rivalId: string

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

let plateCursor = 0
let odometer = 10_000

async function scenario(startOffset: number, endOffset: number) {
  plateCursor += 1
  const [vehicle] = await db.sql<{ id: string }>(
    `insert into public.vehicles (organization_id, make, model, registration_plate, currency, daily_rate_minor, odometer)
     values ($1, 'Toyota', 'Yaris', $2, 'EUR', 4000, $3) returning id`,
    [organizationId, `OCC-${plateCursor}`, odometer],
  )
  const [customer] = await db.sql<{ id: string }>(
    `insert into public.customers (organization_id, first_name, last_name)
     values ($1, 'Occupancy', $2) returning id`,
    [organizationId, `Case ${plateCursor}`],
  )
  const [rental] = await db.sql<{ id: string }>(
    `insert into public.rentals
       (organization_id, vehicle_id, customer_id, starts_at, ends_at, currency, status, daily_rate_minor)
     values ($1, $2, $3, $4::timestamptz, $5::timestamptz, 'EUR', 'draft', 4000) returning id`,
    [organizationId, vehicle!.id, customer!.id, at(startOffset), at(endOffset)],
  )
  await db.sql(
    `insert into public.rental_drivers (organization_id, rental_id, customer_id, driver_role)
     values ($1, $2, $3, 'primary')`,
    [organizationId, rental!.id, customer!.id],
  )
  await asOwner(`select public.rental_confirm($1)`, [rental!.id])
  return { vehicleId: vehicle!.id, customerId: customer!.id, rentalId: rental!.id }
}

function asOwner(query: string, params: unknown[] = []) {
  return db.asUser(ownerId, (session) => session.sql(query, params))
}

const checkOut = (rentalId: string) => {
  odometer += 100
  return asOwner(`select public.rental_check_out($1, $2)`, [rentalId, odometer])
}
const checkIn = (rentalId: string) => {
  odometer += 100
  return asOwner(`select public.rental_check_in($1, $2)`, [rentalId, odometer])
}
const complete = (rentalId: string) => asOwner(`select public.rental_complete($1)`, [rentalId])

async function fleet(vehicleId: string) {
  const [row] = await db.asUser(ownerId, (session) =>
    session.sql<{
      effective_status: string
      is_available_now: boolean
      current_rental_id: string | null
      next_rental_id: string | null
    }>(
      `select effective_status, is_available_now, current_rental_id, next_rental_id
         from public.vehicle_fleet where vehicle_id = $1`,
      [vehicleId],
    ),
  )
  return row!
}

async function customerActive(customerId: string) {
  const [row] = await db.asUser(ownerId, (session) =>
    session.sql<{ active_rental_id: string | null }>(
      `select active_rental_id from public.customer_directory where customer_id = $1`,
      [customerId],
    ),
  )
  const [summary] = await db.asUser(ownerId, (session) =>
    session.sql<{ active_rental_id: string | null }>(
      `select active_rental_id from public.customer_rental_summary($1)`,
      [customerId],
    ),
  )
  return { directory: row!.active_rental_id, summary: summary!.active_rental_id }
}

async function rentedCount(): Promise<number> {
  const [row] = await db.asUser(ownerId, (session) =>
    session.sql<{ rented: number }>(`select rented from public.fleet_status_counts($1)`, [
      organizationId,
    ]),
  )
  return Number(row!.rented)
}

beforeAll(async () => {
  db = await TestDatabase.create()

  const owner = await signUp(db, {
    email: 'owner@occupancy.test',
    fullName: 'Occupancy Owner',
    organizationName: 'Occupancy Motors',
    currency: 'EUR',
  })
  if (!owner.organizationId) throw new Error('Provisioning failed during setup.')
  ownerId = owner.userId
  organizationId = owner.organizationId

  const rival = await signUp(db, {
    email: 'rival@occupancy.test',
    fullName: 'Rival Owner',
    organizationName: 'Rival Rentals',
    currency: 'EUR',
  })
  rivalId = rival.userId
}, 180_000)

afterAll(async () => {
  await db?.close()
})

describe('fleet occupancy', () => {
  it('leaves a vehicle with no rental available', async () => {
    plateCursor += 1
    const [vehicle] = await db.sql<{ id: string }>(
      `insert into public.vehicles (organization_id, make, model, registration_plate, currency, daily_rate_minor, odometer)
       values ($1, 'Kia', 'Picanto', $2, 'EUR', 3000, 5000) returning id`,
      [organizationId, `OCC-${plateCursor}`],
    )

    const row = await fleet(vehicle!.id)
    expect(row.effective_status).toBe('available')
    expect(row.is_available_now).toBe(true)
    expect(row.current_rental_id).toBeNull()
  })

  it('keeps a future reservation from marking the vehicle rented now', async () => {
    const s = await scenario(5 * DAY, 7 * DAY)

    const row = await fleet(s.vehicleId)
    expect(row.effective_status).toBe('available')
    expect(row.is_available_now).toBe(true)
    expect(row.next_rental_id).toBe(s.rentalId)
    expect((await customerActive(s.customerId)).directory).toBeNull()
  })

  it('shows a reservation whose pickup time has passed as reserved', async () => {
    const s = await scenario(-1 * HOUR, 2 * DAY)

    const row = await fleet(s.vehicleId)
    expect(row.effective_status).toBe('reserved')
    expect(row.is_available_now).toBe(false)
  })

  it('shows a vehicle handed over before its scheduled start as rented', async () => {
    const s = await scenario(2 * HOUR, 2 * DAY)
    const before = await rentedCount()

    await checkOut(s.rentalId)

    const row = await fleet(s.vehicleId)
    expect(row.effective_status).toBe('rented')
    expect(row.is_available_now).toBe(false)
    expect(row.current_rental_id).toBe(s.rentalId)
    expect(await rentedCount()).toBe(before + 1)
    expect(await customerActive(s.customerId)).toEqual({
      directory: s.rentalId,
      summary: s.rentalId,
    })
  })

  it('keeps an overdue rental rented until it is completed', async () => {
    const s = await scenario(-3 * DAY, -1 * HOUR)
    await checkOut(s.rentalId)

    const row = await fleet(s.vehicleId)
    expect(row.effective_status).toBe('rented')
    expect(row.current_rental_id).toBe(s.rentalId)
    expect(await customerActive(s.customerId)).toEqual({
      directory: s.rentalId,
      summary: s.rentalId,
    })
  })

  it('keeps a returned but uncompleted rental holding the vehicle, then frees it', async () => {
    const s = await scenario(-2 * DAY, 1 * DAY)
    await checkOut(s.rentalId)
    await checkIn(s.rentalId)

    expect((await fleet(s.vehicleId)).effective_status).toBe('rented')

    await complete(s.rentalId)

    const row = await fleet(s.vehicleId)
    expect(row.effective_status).toBe('available')
    expect(row.is_available_now).toBe(true)
    expect(row.current_rental_id).toBeNull()
    expect(await customerActive(s.customerId)).toEqual({ directory: null, summary: null })
  })

  it('still refuses an overlapping booking for a vehicle that is out', async () => {
    const s = await scenario(2 * HOUR, 2 * DAY)
    await checkOut(s.rentalId)

    await db.expectRejection(
      () =>
        db.sql(
          `insert into public.rentals
             (organization_id, vehicle_id, customer_id, starts_at, ends_at, currency, status, daily_rate_minor)
           values ($1, $2, $3, $4::timestamptz, $5::timestamptz, 'EUR', 'reserved', 4000)`,
          [organizationId, s.vehicleId, s.customerId, at(1 * DAY), at(3 * DAY)],
        ),
      /rentals_no_vehicle_overlap/,
    )
  })

  it('shows another agency none of it', async () => {
    const s = await scenario(2 * HOUR, 2 * DAY)
    await checkOut(s.rentalId)

    const fleetRows = await db.asUser(rivalId, (session) =>
      session.sql(`select 1 from public.vehicle_fleet where vehicle_id = $1`, [s.vehicleId]),
    )
    const customerRows = await db.asUser(rivalId, (session) =>
      session.sql(`select 1 from public.customer_directory where customer_id = $1`, [s.customerId]),
    )
    expect(fleetRows).toHaveLength(0)
    expect(customerRows).toHaveLength(0)
    await db.expectRejection(
      () =>
        db.asUser(rivalId, (session) =>
          session.sql(`select * from public.customer_rental_summary($1)`, [s.customerId]),
        ),
      /Customer not found/,
    )
  })

  it('keeps both views security_invoker', async () => {
    const rows = await db.sql<{ relname: string; options: string[] | null }>(
      `select c.relname, c.reloptions as options
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('vehicle_fleet', 'customer_directory')
        order by c.relname`,
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.options).toContain('security_invoker=true')
    await db.sql(`select app.assert_views_are_security_invoker()`)
  })
})
