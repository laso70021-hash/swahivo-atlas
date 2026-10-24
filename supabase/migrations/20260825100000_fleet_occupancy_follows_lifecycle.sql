-- Fleet occupancy follows the rental lifecycle, not the clock.
--
-- vehicle_fleet, customer_directory and customer_rental_summary treated an
-- active rental as current only between its scheduled starts_at and ends_at. The
-- lifecycle says otherwise: rental_check_out moves a reservation to 'active' when
-- the car is handed over, and only rental_complete (after a recorded return)
-- moves it on. So a car handed over before its scheduled start, or kept past its
-- scheduled return, showed as available while a customer had it.
--
-- Only those occupancy conditions change. Columns, types, order, grants and
-- security_invoker are as before. Reservations, availability search and the
-- rentals_no_vehicle_overlap constraint are untouched.

create or replace view public.vehicle_fleet
with (security_invoker = true)
as
select
  v.id                       as vehicle_id,
  v.organization_id,
  v.make,
  v.model,
  v.model_year,
  v.registration_plate,
  v.vin,
  v.color,
  v.category,
  v.fuel_type,
  v.transmission,
  v.seats,
  v.odometer,
  v.daily_rate_minor,
  v.currency,
  v.insurance_expires_on,
  v.inspection_expires_on,
  v.registration_expires_on,
  v.next_service_on,
  v.notes,
  v.created_at,
  v.updated_at,
  v.archived_at,
  v.status                   as operational_status,

  current_rental.id          as current_rental_id,
  current_rental.reference   as current_rental_reference,
  current_rental.customer_id as current_customer_id,
  current_rental.ends_at     as current_rental_ends_at,

  next_rental.id             as next_rental_id,
  next_rental.reference      as next_rental_reference,
  next_rental.customer_id    as next_customer_id,
  next_rental.starts_at      as next_rental_starts_at,

  case
    when v.archived_at is not null      then 'unavailable'::public.vehicle_status
    when v.status <> 'available'        then v.status
    when current_rental.id is not null  then 'rented'::public.vehicle_status
    when next_rental.id is not null
     and next_rental.starts_at <= now() then 'reserved'::public.vehicle_status
    else 'available'::public.vehicle_status
  end                        as effective_status,

  -- True when the vehicle can be handed to a customer right now.
  (
    v.archived_at is null
    and v.status = 'available'
    and current_rental.id is null
    and (next_rental.id is null or next_rental.starts_at > now())
  )                          as is_available_now,

  -- Acquisition. A fact about the car, true whether or not anybody financed it,
  -- and stored with its own currency so changing the agency default cannot
  -- rewrite what a vehicle cost.
  v.acquisition_method,
  v.acquired_on,
  v.acquisition_price_minor,
  v.acquisition_currency,
  v.acquisition_supplier,
  v.acquisition_notes
from public.vehicles v

-- The contract the vehicle is out on at this moment. An active rental holds the
-- car from check-out until it is completed, whatever the schedule says: handed
-- over early, overdue, or back but not yet closed. A rental still out with the
-- customer is preferred over one already returned.
left join lateral (
  select r.id, r.reference, r.customer_id, r.ends_at
  from public.rentals r
  where r.vehicle_id = v.id
    and r.status = 'active'
  order by (r.returned_at is not null), r.starts_at
  limit 1
) current_rental on true

-- The soonest commitment that has not finished yet.
left join lateral (
  select r.id, r.reference, r.customer_id, r.starts_at
  from public.rentals r
  where r.vehicle_id = v.id
    and r.status = 'reserved'
    and r.ends_at > now()
  order by r.starts_at
  limit 1
) next_rental on true;

create or replace view public.customer_directory
with (security_invoker = true)
as
select
  c.id                       as customer_id,
  c.organization_id,
  c.customer_type,
  c.display_name,
  c.first_name,
  c.last_name,
  c.company_name,
  c.email,
  c.phone,
  c.secondary_phone,
  c.date_of_birth,
  c.nationality_country_code,
  c.country_code,
  c.city,
  c.region,
  c.postal_code,
  c.address_line1,
  c.address_line2,
  c.preferred_locale,
  -- Internal notes. Agency members only, by the same RLS as the row itself.
  c.notes,
  c.created_at,
  c.updated_at,
  c.archived_at,

  -- Identification: counts and validity only. The numbers themselves are read
  -- from customer_documents, on the profile, by someone who opened it.
  coalesce(docs.identity_count, 0)        as identity_document_count,
  coalesce(docs.document_count, 0)        as document_count,
  docs.identity_expires_on,

  licence.id                              as driver_license_id,
  licence.issuing_country                 as driver_license_country,
  licence.issued_on                       as driver_license_issued_on,
  licence.expires_on                      as driver_license_expires_on,
  licence.license_classes                 as driver_license_classes,
  (licence.id is not null)                as has_driver_license,

  coalesce(hist.rental_count, 0)          as rental_count,
  hist.first_rental_at,
  hist.last_rental_ends_at,
  hist.active_rental_id,
  hist.active_rental_reference,
  hist.active_rental_ends_at,
  hist.upcoming_rental_id,
  hist.upcoming_rental_reference,
  hist.upcoming_rental_starts_at,

  -- Money is only ever reported when it is unambiguous. A customer billed in two
  -- currencies gets a count instead of a total, because adding EUR to MAD would
  -- be a confident lie.
  coalesce(money.currency_count, 0)       as outstanding_currency_count,
  case when money.currency_count = 1 then money.outstanding_minor end as outstanding_minor,
  case when money.currency_count = 1 then money.currency end          as outstanding_currency
from public.customers c

left join lateral (
  select
    count(*) filter (where d.document_type <> 'driver_license') as identity_count,
    count(*)                                                    as document_count,
    min(d.expires_on) filter (where d.document_type <> 'driver_license') as identity_expires_on
  from public.customer_documents d
  where d.customer_id = c.id
) docs on true

-- The licence that stays valid longest is the one that matters operationally.
left join lateral (
  select d.id, d.issuing_country, d.issued_on, d.expires_on, d.license_classes
  from public.customer_documents d
  where d.customer_id = c.id
    and d.document_type = 'driver_license'
  order by d.expires_on desc nulls last, d.created_at desc
  limit 1
) licence on true

left join lateral (
  select
    count(*)                                as rental_count,
    min(r.starts_at)                        as first_rental_at,
    max(r.ends_at) filter (where r.status = 'completed') as last_rental_ends_at,
    (array_agg(r.id order by (r.returned_at is not null), r.starts_at)
       filter (where r.status = 'active'))[1]        as active_rental_id,
    (array_agg(r.reference order by (r.returned_at is not null), r.starts_at)
       filter (where r.status = 'active'))[1]        as active_rental_reference,
    (array_agg(r.ends_at order by (r.returned_at is not null), r.starts_at)
       filter (where r.status = 'active'))[1]        as active_rental_ends_at,
    (array_agg(r.id order by r.starts_at)
       filter (where r.status = 'reserved' and r.ends_at > now()))[1]                               as upcoming_rental_id,
    (array_agg(r.reference order by r.starts_at)
       filter (where r.status = 'reserved' and r.ends_at > now()))[1]                               as upcoming_rental_reference,
    (array_agg(r.starts_at order by r.starts_at)
       filter (where r.status = 'reserved' and r.ends_at > now()))[1]                               as upcoming_rental_starts_at
  from public.rentals r
  where r.customer_id = c.id
) hist on true

left join lateral (
  select
    count(*)                                        as currency_count,
    (array_agg(t.currency order by t.currency))[1]  as currency,
    (array_agg(t.outstanding order by t.currency))[1] as outstanding_minor
  from (
    select r.currency, sum(r.balance_due_minor)::bigint as outstanding
    from public.rentals r
    where r.customer_id = c.id
      and r.status in ('reserved', 'active', 'completed')
      and r.balance_due_minor > 0
    group by r.currency
  ) t
) money on true;

create or replace function public.customer_rental_summary(p_customer_id uuid)
returns table (
  rental_count       bigint,
  completed_count    bigint,
  cancelled_count    bigint,
  first_rental_at    timestamptz,
  last_rental_ends_at timestamptz,
  active_rental_id   uuid,
  upcoming_rental_id uuid
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
begin
  select c.organization_id into v_organization_id
  from public.customers c
  where c.id = p_customer_id;

  -- Indistinguishable from "does not exist", so a probe cannot confirm that an
  -- identifier belongs to some other agency.
  if v_organization_id is null or not app.is_org_member(v_organization_id) then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  return query
  select
    count(*),
    count(*) filter (where r.status = 'completed'),
    count(*) filter (where r.status = 'cancelled'),
    min(r.starts_at),
    max(r.ends_at) filter (where r.status = 'completed'),
    (array_agg(r.id order by (r.returned_at is not null), r.starts_at)
       filter (where r.status = 'active'))[1],
    (array_agg(r.id order by r.starts_at)
       filter (where r.status = 'reserved' and r.ends_at > now()))[1]
  from public.rentals r
  where r.customer_id = p_customer_id;
end;
$$;

select app.assert_views_are_security_invoker();
