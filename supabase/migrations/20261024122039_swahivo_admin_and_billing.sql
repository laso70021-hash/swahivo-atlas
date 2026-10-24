-- Administrative configuration and server-only subscription settlement.
set search_path=public,extensions,pg_temp;
alter table public.marketplace_offers add column test_drives_available boolean not null default false,
 add column financing_available boolean not null default false,
 add column rental_terms text not null default '';

create or replace view public.marketplace_catalogue with(security_invoker=true) as
select o.id,o.organization_id,o.slug,o.service,o.title,o.make,o.model,o.model_year,o.condition,o.category,o.price_minor,o.currency,o.mileage,o.transmission,o.fuel_type,o.seats,o.location,o.description,o.images,o.status,o.featured,o.vehicle_id,o.self_drive,o.chauffeur,o.deposit_minor,o.created_by,o.created_at,o.updated_at,
b.name as business_name,b.slug as business_slug,b.whatsapp_number_e164,b.whatsapp_enabled,b.business_phone,
o.test_drives_available,o.financing_available,o.rental_terms
from public.marketplace_offers o join public.marketplace_businesses b on b.organization_id=o.organization_id where o.status='published' and b.approved;

create table public.marketplace_configuration (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('brand','category','content','marketing')),
 name text not null check(char_length(name) between 1 and 160),description text not null default '',
 published boolean not null default false,created_at timestamptz not null default now(),unique(kind,name)
);
alter table public.marketplace_configuration enable row level security;
revoke all on public.marketplace_configuration from anon,authenticated;
grant select on public.marketplace_configuration to anon,authenticated;grant insert,update,delete on public.marketplace_configuration to authenticated;
create policy configuration_public on public.marketplace_configuration for select to anon,authenticated using(published);
create policy configuration_admin on public.marketplace_configuration for all to authenticated using(app.sw_admin()) with check(app.sw_admin());

create function public.marketplace_admin_users() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(x) from(select p.id,p.full_name,p.email,u.email_confirmed_at is not null as confirmed,u.created_at,exists(select 1 from public.platform_admins a where a.user_id=p.id) as platform_admin from public.profiles p join auth.users u on u.id=p.id order by u.created_at desc limit 500)x),'[]');end;$$;
create function public.marketplace_admin_fleet() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(x) from(select v.id,v.make,v.model,v.registration_plate,v.status,v.archived_at,b.name as business_name from public.vehicles v join public.marketplace_businesses b on b.organization_id=v.organization_id order by v.created_at desc limit 500)x),'[]');end;$$;
create function public.marketplace_admin_service(p_organization_id uuid,p_service text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
if p_service not in ('dealership','rental') then raise exception 'Invalid service.';end if;
if p_enabled then
 if not exists(select 1 from public.marketplace_businesses where organization_id=p_organization_id and approved) then raise exception 'Business is not approved.';end if;
 insert into public.business_service_access(organization_id,service,approved_by) values(p_organization_id,p_service,(select auth.uid())) on conflict do nothing;
else delete from public.business_service_access where organization_id=p_organization_id and service=p_service;
end if;
insert into public.marketplace_audit_events(actor_id,organization_id,action,detail) values((select auth.uid()),p_organization_id,'business.service_changed',jsonb_build_object('service',p_service,'enabled',p_enabled));
end;$$;

-- Customer feedback checks the completed transaction without granting access
-- to the provider's private rental records.
create function app.sw_completed_transaction(p_org uuid,p_reservation uuid,p_order uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.marketplace_reservations r join public.rentals x on x.id=r.rental_id where r.id=p_reservation and r.customer_id=(select auth.uid()) and r.organization_id=p_org and x.status='completed') or exists(select 1 from public.marketplace_orders o where o.id=p_order and o.customer_id=(select auth.uid()) and o.organization_id=p_org and o.status='completed');
$$;
revoke all on function app.sw_completed_transaction(uuid,uuid,uuid) from public,anon;
grant execute on function app.sw_completed_transaction(uuid,uuid,uuid) to authenticated;
drop policy reviews_create on public.marketplace_reviews;
create policy reviews_create on public.marketplace_reviews for insert to authenticated with check(author_id=(select auth.uid()) and app.sw_completed_transaction(organization_id,reservation_id,order_id));

create function app.sw_sync_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
update public.marketplace_reservations set status=case new.status when 'active' then 'active' when 'completed' then 'completed' when 'cancelled' then 'cancelled' when 'reserved' then 'confirmed' else status end where rental_id=new.id;
return new;end;$$;
create trigger marketplace_reservation_lifecycle after update of status on public.rentals for each row execute function app.sw_sync_reservation();

alter table public.marketplace_subscriptions add column stripe_subscription_id text unique,add column provider text not null default 'unconfigured';
create table public.marketplace_checkout_sessions (
 id text primary key,organization_id uuid not null references public.organizations(id),package_id uuid not null references public.service_packages(id),
 service text not null check(service in ('dealership','rental')),stripe_subscription_id text,live_mode boolean not null,created_at timestamptz not null default now()
);
create table public.marketplace_billing_events (
 id text primary key,event_type text not null,created_at timestamptz not null default now()
);
alter table public.marketplace_checkout_sessions enable row level security;alter table public.marketplace_billing_events enable row level security;
revoke all on public.marketplace_checkout_sessions,public.marketplace_billing_events from anon,authenticated;
grant select on public.marketplace_checkout_sessions to authenticated;
create policy checkout_owner_read on public.marketplace_checkout_sessions for select to authenticated using(app.has_min_role(organization_id,'owner') or app.sw_admin());

create function public.marketplace_apply_billing_event(p_event_id text,p_event_type text,p_checkout_id text,p_subscription_id text,p_status text,p_expires_at timestamptz,p_payment_reference text) returns void language plpgsql security definer set search_path='' as $$
declare c public.marketplace_checkout_sessions;p public.service_packages;begin
select * into c from public.marketplace_checkout_sessions where id=p_checkout_id for update;
if not found then raise exception 'Unknown checkout session.';end if;
select * into p from public.service_packages where id=c.package_id;
if p.service<>c.service or p.stripe_price_id is null then raise exception 'Checkout package mismatch.';end if;
if p_status not in ('active','pending','expired','cancelled') then raise exception 'Invalid subscription state.';end if;
insert into public.marketplace_billing_events(id,event_type) values(p_event_id,p_event_type) on conflict do nothing;
if not found then return;end if;
update public.marketplace_checkout_sessions set stripe_subscription_id=p_subscription_id where id=c.id;
insert into public.marketplace_subscriptions(organization_id,service,package_id,status,expires_at,paid_reference,stripe_subscription_id,provider) values(c.organization_id,c.service,c.package_id,p_status,p_expires_at,p_payment_reference,p_subscription_id,'stripe') on conflict(organization_id,service) do update set package_id=excluded.package_id,status=excluded.status,expires_at=excluded.expires_at,paid_reference=excluded.paid_reference,stripe_subscription_id=excluded.stripe_subscription_id,provider='stripe',updated_at=now();
end;$$;
revoke all on function public.marketplace_apply_billing_event(text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.marketplace_apply_billing_event(text,text,text,text,text,timestamptz,text) to service_role;

create function public.marketplace_admin_payment_record(p_order_id uuid,p_reference text,p_amount_minor bigint) returns void language plpgsql security definer set search_path='' as $$
declare o public.marketplace_orders;begin
if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
select * into o from public.marketplace_orders where id=p_order_id for update;
if not found or o.status='cancelled' then raise exception 'Order unavailable.';end if;
if p_amount_minor<>o.amount_minor or char_length(btrim(p_reference))<5 then raise exception 'A matching received amount and payment reference are required.';end if;
update public.marketplace_orders set payment_status='paid',payment_reference=btrim(p_reference) where id=o.id;
insert into public.marketplace_audit_events(actor_id,organization_id,action,entity_id,detail) values((select auth.uid()),o.organization_id,'order.offline_payment_recorded',o.id,jsonb_build_object('reference',p_reference,'amount_minor',p_amount_minor,'source','administrator_recorded_offline_receipt'));
end;$$;

revoke all on function public.marketplace_admin_users(),public.marketplace_admin_fleet(),public.marketplace_admin_service(uuid,text,boolean),public.marketplace_admin_payment_record(uuid,text,bigint) from public,anon;
grant execute on function public.marketplace_admin_users(),public.marketplace_admin_fleet(),public.marketplace_admin_service(uuid,text,boolean),public.marketplace_admin_payment_record(uuid,text,bigint) to authenticated;
revoke all on function app.sw_sync_reservation() from public,anon,authenticated;

create or replace function public.marketplace_customer_request(p_offer_id uuid,p_kind text,p_message text,p_from timestamptz default null,p_to timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());v_id uuid;begin
if u is null then raise exception 'Sign in required.' using errcode='42501';end if;
select * into o from public.marketplace_offers where id=p_offer_id and service='dealership' and status='published';if not found or not app.sw_service(o.organization_id,'dealership') then raise exception 'Sale listing unavailable.';end if;
if p_kind='test_drive' then
 if not o.test_drives_available then raise exception 'This provider does not offer test drives for this vehicle.';end if;
 if p_from is null or p_to is null or p_from<now() or p_to<=p_from or p_to-p_from>interval '1 day' then raise exception 'Choose a valid test-drive appointment.';end if;
 if (select count(*) from public.marketplace_test_drives where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before requesting more appointments.';end if;
 insert into public.marketplace_test_drives(organization_id,offer_id,customer_id,starts_at,ends_at,notes) values(o.organization_id,o.id,u,p_from,p_to,left(p_message,4000)) returning id into v_id;
elsif p_kind='finance' then
 if not o.financing_available then raise exception 'This provider has not enabled financing enquiries for this vehicle.';end if;
 if (select count(*) from public.marketplace_finance_requests where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before requesting more information.';end if;
 insert into public.marketplace_finance_requests(organization_id,offer_id,customer_id,message) values(o.organization_id,o.id,u,left(p_message,4000)) returning id into v_id;
else raise exception 'Unsupported request type.';end if;return v_id;
end;$$;
