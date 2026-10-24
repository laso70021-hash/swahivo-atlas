-- Swahivo: additive marketplace and service approval over Atlas's rental engine.
-- Existing organizations retain rental access. New registrations request access;
-- user-editable Auth metadata NEVER grants provider or platform privileges.
set search_path = public, extensions, pg_temp;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
create function app.sw_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_admins where user_id=(select auth.uid()));
$$;
revoke all on function app.sw_admin() from public, anon;
grant execute on function app.sw_admin() to authenticated, service_role;

create table public.business_service_access (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 service text not null check(service in ('dealership','rental')),
 approved_at timestamptz not null default now(), approved_by uuid references auth.users(id),
 primary key(organization_id,service)
);
alter table public.business_service_access enable row level security;
revoke all on public.business_service_access from anon, authenticated;
grant select on public.business_service_access to authenticated;
create function app.sw_service(p_org uuid,p_service text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_service_access where organization_id=p_org and service=p_service);
$$;
revoke all on function app.sw_service(uuid,text) from public;
grant execute on function app.sw_service(uuid,text) to anon, authenticated, service_role;
create policy service_read on public.business_service_access for select to authenticated using(app.is_org_member(organization_id) or app.sw_admin());
insert into public.business_service_access(organization_id,service) select id,'rental' from public.organizations;

create table public.marketplace_businesses (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 120), slug text not null unique,
 city text not null default '', region text not null default '', country_code text not null default 'TZ',
 address text not null default '', description text not null default '' check(char_length(description)<=4000),
 business_phone text, whatsapp_number_e164 text check(whatsapp_number_e164 is null or whatsapp_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 whatsapp_enabled boolean not null default false, logo_path text, banner_path text,
 approved boolean not null default false, created_at timestamptz not null default now()
);
alter table public.marketplace_businesses enable row level security;
revoke all on public.marketplace_businesses from anon,authenticated;
grant select on public.marketplace_businesses to anon,authenticated;
grant update(name,city,region,address,description,business_phone,whatsapp_number_e164,whatsapp_enabled,logo_path,banner_path) on public.marketplace_businesses to authenticated;
create policy business_public_read on public.marketplace_businesses for select to anon,authenticated using(approved);
create policy business_member_read on public.marketplace_businesses for select to authenticated using(app.is_org_member(organization_id));
create policy business_admin_read on public.marketplace_businesses for select to authenticated using(app.sw_admin());
create policy business_update on public.marketplace_businesses for update to authenticated using(app.has_min_role(organization_id,'admin')) with check(app.has_min_role(organization_id,'admin'));
insert into public.marketplace_businesses(organization_id,name,slug,country_code,approved) select id,name,slug,coalesce(country_code::text,'TZ'),true from public.organizations;

create table public.business_applications (
 id uuid primary key default gen_random_uuid(), applicant_id uuid not null references auth.users(id) on delete cascade,
 business_name text not null check(char_length(btrim(business_name)) between 2 and 120),
 requested_services text[] not null check(cardinality(requested_services) between 1 and 2 and requested_services <@ array['dealership','rental']::text[]),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 country_code text not null default 'TZ', city text not null default '',region text not null default '',address text not null default '',description text not null default '',
 business_phone text not null default '',whatsapp_number_e164 text check(whatsapp_number_e164 is null or whatsapp_number_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 registration_number text,decision_note text,organization_id uuid references public.organizations(id),
 created_at timestamptz not null default now(), decided_at timestamptz,decided_by uuid references auth.users(id)
);
create unique index business_application_pending_owner on public.business_applications(applicant_id) where status='pending';
alter table public.business_applications enable row level security;
revoke all on public.business_applications from anon,authenticated;
grant select on public.business_applications to authenticated;
create policy applications_read on public.business_applications for select to authenticated using(applicant_id=(select auth.uid()) or app.sw_admin());

create table public.service_packages (
 id uuid primary key default gen_random_uuid(), service text not null check(service in ('dealership','rental')),
 name text not null, monthly_tzs bigint check(monthly_tzs is null or monthly_tzs>=0),
 listing_limit integer check(listing_limit is null or listing_limit>0),published boolean not null default false,
 stripe_price_id text,features text[] not null default '{}', unique(service,name)
);
alter table public.service_packages enable row level security;
revoke all on public.service_packages from anon,authenticated;
grant select on public.service_packages to anon,authenticated;
create policy packages_read on public.service_packages for select to anon,authenticated using(published);
create policy packages_admin_read on public.service_packages for select to authenticated using(app.sw_admin());
insert into public.service_packages(service,name,monthly_tzs,listing_limit,published,features) values
 ('dealership','Free',0,1,true,array['1 active sale listing','Direct customer enquiries','Provider WhatsApp contact']),
 ('dealership','Starter',49000,10,true,array['10 active sale listings','Customer enquiries','Sales CRM']),
 ('dealership','Growth',99000,30,true,array['30 active sale listings','Customer enquiries','Sales CRM']),
 ('dealership','Professional',199000,50,true,array['50 active sale listings','Customer enquiries','Sales CRM']),
 ('dealership','Business',299000,100,true,array['100 active sale listings','Customer enquiries','Sales CRM']),
 ('dealership','Enterprise',399000,200,true,array['200 active sale listings','Customer enquiries','Sales CRM']),
 ('rental','Rental',null,null,false,array['Rental fleet','Reservations and contracts','Rental operations','GPS integration']);
create table public.marketplace_subscriptions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 service text not null check(service in ('dealership','rental')), package_id uuid not null references public.service_packages(id),
 status text not null check(status in ('active','pending','expired','cancelled')), paid_reference text,
 expires_at timestamptz,updated_at timestamptz not null default now(), primary key(organization_id,service)
);
alter table public.marketplace_subscriptions enable row level security;
revoke all on public.marketplace_subscriptions from anon,authenticated;
grant select on public.marketplace_subscriptions to authenticated;
create policy subscription_read on public.marketplace_subscriptions for select to authenticated using(app.is_org_member(organization_id) or app.sw_admin());

create table public.marketplace_offers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 slug text not null unique default gen_random_uuid()::text,service text not null check(service in ('dealership','rental')),
 title text not null check(char_length(title) between 2 and 160),make text not null,model text not null,
 model_year integer not null check(model_year between 1900 and 2100),condition text not null default 'used' check(condition in ('new','used')),
 category text not null default 'Sedan',price_minor bigint not null check(price_minor>=0),currency text not null default 'TZS' check(currency ~ '^[A-Z]{3}$'),
 mileage integer not null default 0 check(mileage>=0),transmission text not null default 'automatic' check(transmission in ('automatic','manual')),
 fuel_type text not null default 'petrol',seats integer not null default 5 check(seats between 1 and 100),
 location text not null,description text not null default '' check(char_length(description)<=10000),images text[] not null default '{}' check(cardinality(images)<=20),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected','sold','archived')),
 featured boolean not null default false,vehicle_id uuid,
 self_drive boolean not null default true,chauffeur boolean not null default false,deposit_minor bigint not null default 0 check(deposit_minor>=0),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint rental_offer_vehicle_required check(service<>'rental' or vehicle_id is not null),
 constraint offer_vehicle_tenant foreign key(vehicle_id,organization_id) references public.vehicles(id,organization_id),
 unique(id,organization_id)
);
create index offers_public_search on public.marketplace_offers(service,status,location,make,price_minor);
create unique index one_rental_offer_per_vehicle on public.marketplace_offers(vehicle_id) where service='rental' and status<>'archived';
alter table public.marketplace_offers enable row level security;
revoke all on public.marketplace_offers from anon,authenticated;
grant select on public.marketplace_offers to anon,authenticated;
grant insert,update,delete on public.marketplace_offers to authenticated;
create policy offers_public on public.marketplace_offers for select to anon,authenticated using(status='published' and app.sw_service(organization_id,service));
create policy offers_provider_read on public.marketplace_offers for select to authenticated using((app.is_org_member(organization_id) and app.sw_service(organization_id,service)) or app.sw_admin());
create policy offers_insert on public.marketplace_offers for insert to authenticated with check(app.has_min_role(organization_id,'manager') and app.sw_service(organization_id,service) and status in ('draft','pending'));
create policy offers_update on public.marketplace_offers for update to authenticated using(app.has_min_role(organization_id,'manager') and app.sw_service(organization_id,service)) with check(app.has_min_role(organization_id,'manager') and app.sw_service(organization_id,service));
create policy offers_delete on public.marketplace_offers for delete to authenticated using(app.has_min_role(organization_id,'admin') and status in ('draft','rejected'));

create function app.sw_guard_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit integer;v_count integer;v_vehicle public.vehicles;
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.service<>old.service or new.id<>old.id or new.created_by is distinct from old.created_by) then raise exception 'Listing ownership and service cannot change.' using errcode='42501'; end if;
 if not app.sw_admin() then
  if tg_op='INSERT' and (new.status not in ('draft','pending') or new.featured) then raise exception 'Listing approval requires a platform administrator.' using errcode='42501'; end if;
  if tg_op='UPDATE' then
   if new.featured is distinct from old.featured or (new.status='published' and old.status<>'published') or (new.status='rejected' and old.status<>'rejected') then raise exception 'Listing approval requires a platform administrator.' using errcode='42501'; end if;
   if old.status='published' and new.status='published' and (to_jsonb(new)-array['updated_at','status']) is distinct from (to_jsonb(old)-array['updated_at','status']) then new.status:='pending'; end if;
  end if;
 end if;
 if new.vehicle_id is not null then
  select * into v_vehicle from public.vehicles where id=new.vehicle_id and organization_id=new.organization_id for update;
  if not found then raise exception 'Vehicle does not belong to this business.'; end if;
  if new.service='rental' and new.status in ('pending','published') and (v_vehicle.archived_at is not null or exists(select 1 from public.marketplace_offers o where o.vehicle_id=new.vehicle_id and o.service='dealership' and o.status='sold')) then raise exception 'A sold or archived vehicle cannot be offered for rental.'; end if;
  if new.status='sold' then
   if exists(select 1 from public.rentals where vehicle_id=new.vehicle_id and status in ('reserved','active')) then raise exception 'This vehicle still has rental commitments.'; end if;
   update public.marketplace_offers set status='archived' where vehicle_id=new.vehicle_id and service='rental';
   update public.vehicles set status='unavailable' where id=new.vehicle_id;
  end if;
 end if;
 if new.service='dealership' and new.status in ('pending','published') then
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,901));
  select p.listing_limit into v_limit from public.marketplace_subscriptions s join public.service_packages p on p.id=s.package_id where s.organization_id=new.organization_id and s.service='dealership' and s.status='active' and (s.expires_at is null or s.expires_at>now());
  v_limit:=coalesce(v_limit,1);
  select count(*) into v_count from public.marketplace_offers where organization_id=new.organization_id and service='dealership' and status in ('pending','published') and id<>new.id;
  if v_count>=v_limit then raise exception 'Your dealership package allows % active sale listings.',v_limit using errcode='23514'; end if;
 end if;
 if tg_op='INSERT' then new.created_by:=(select auth.uid()); end if;
 new.updated_at:=now();return new;
end;$$;
create trigger marketplace_offer_guard before insert or update on public.marketplace_offers for each row execute function app.sw_guard_offer();

create view public.marketplace_catalogue with(security_invoker=true) as
 select o.*,b.name as business_name,b.slug as business_slug,b.whatsapp_number_e164,b.whatsapp_enabled,b.business_phone
 from public.marketplace_offers o join public.marketplace_businesses b on b.organization_id=o.organization_id
 where o.status='published' and b.approved;
grant select on public.marketplace_catalogue to anon,authenticated;

create table public.marketplace_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,offer_id uuid not null references public.marketplace_offers(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,offer_id)
);
alter table public.marketplace_favorites enable row level security;
revoke all on public.marketplace_favorites from anon,authenticated;grant select,insert,delete on public.marketplace_favorites to authenticated;
create policy favorites_own on public.marketplace_favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table public.marketplace_enquiries (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,customer_id uuid not null references auth.users(id) on delete cascade,
 service text not null check(service in ('dealership','rental')),message text not null check(char_length(message) between 3 and 4000),
 status text not null default 'new' check(status in ('new','contacted','interested','negotiation','test_drive','won','lost','closed')),
 customer_name text not null,contact_email text not null,created_at timestamptz not null default now(),
 foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id) on delete cascade
);
create index enquiries_business on public.marketplace_enquiries(organization_id,created_at desc);
alter table public.marketplace_enquiries enable row level security;
revoke all on public.marketplace_enquiries from anon,authenticated;grant select,update(status) on public.marketplace_enquiries to authenticated;
create policy enquiries_read on public.marketplace_enquiries for select to authenticated using(customer_id=(select auth.uid()) or (app.is_org_member(organization_id) and app.sw_service(organization_id,service)) or app.sw_admin());
create policy enquiries_update on public.marketplace_enquiries for update to authenticated using(app.is_org_member(organization_id) and app.sw_service(organization_id,service)) with check(app.is_org_member(organization_id) and app.sw_service(organization_id,service));

create table public.crm_leads (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 service text not null check(service in ('dealership','rental')),name text not null check(char_length(name) between 2 and 160),email text,phone text,
 stage text not null default 'new',source text not null default 'manual',notes text check(char_length(notes)<=8000),
 assigned_to uuid references auth.users(id),follow_up_at timestamptz,created_at timestamptz not null default now(),
 unique(id,organization_id)
);
create index crm_leads_business_stage on public.crm_leads(organization_id,service,stage);
alter table public.crm_leads enable row level security;
revoke all on public.crm_leads from anon,authenticated;grant select,insert,update,delete on public.crm_leads to authenticated;
create policy leads_scoped on public.crm_leads for all to authenticated using(app.is_org_member(organization_id) and app.sw_service(organization_id,service)) with check(app.is_org_member(organization_id) and app.sw_service(organization_id,service));
create policy leads_admin_read on public.crm_leads for select to authenticated using(app.sw_admin());
create function app.sw_guard_lead() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.service<>old.service) then raise exception 'Lead ownership cannot change.';end if;
 if new.assigned_to is not null and not exists(select 1 from public.organization_members where user_id=new.assigned_to and organization_id=new.organization_id and status='active') then raise exception 'Assignee must be an active member of this business.';end if;
 return new;end;$$;
create trigger crm_lead_guard before insert or update on public.crm_leads for each row execute function app.sw_guard_lead();
create table public.crm_activities (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,lead_id uuid not null,
 note text not null check(char_length(note) between 1 and 8000),created_by uuid default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(lead_id,organization_id) references public.crm_leads(id,organization_id) on delete cascade
);
create table public.crm_tasks (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,lead_id uuid not null,title text not null,
 due_at timestamptz not null,completed boolean not null default false,created_at timestamptz not null default now(),
 foreign key(lead_id,organization_id) references public.crm_leads(id,organization_id) on delete cascade
);
alter table public.crm_activities enable row level security;alter table public.crm_tasks enable row level security;
revoke all on public.crm_activities,public.crm_tasks from anon,authenticated;
grant select,insert on public.crm_activities to authenticated;grant select,insert,update,delete on public.crm_tasks to authenticated;
create policy activity_scoped on public.crm_activities for all to authenticated using(exists(select 1 from public.crm_leads l where l.id=lead_id and l.organization_id=crm_activities.organization_id)) with check(created_by=(select auth.uid()) and exists(select 1 from public.crm_leads l where l.id=lead_id and l.organization_id=crm_activities.organization_id));
create policy tasks_scoped on public.crm_tasks for all to authenticated using(exists(select 1 from public.crm_leads l where l.id=lead_id and l.organization_id=crm_tasks.organization_id)) with check(exists(select 1 from public.crm_leads l where l.id=lead_id and l.organization_id=crm_tasks.organization_id));

create table public.marketplace_reservations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,customer_id uuid not null references auth.users(id),
 rental_id uuid references public.rentals(id),starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 pickup_location text not null,return_location text not null,driver_name text not null,
 status text not null default 'requested' check(status in ('requested','confirmed','declined','cancelled','active','completed')),
 daily_rate_minor bigint not null,total_minor bigint not null,deposit_minor bigint not null,currency text not null,
 accepted_terms_at timestamptz not null default now(),created_at timestamptz not null default now(),
 foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id),
 foreign key(rental_id,organization_id) references public.rentals(id,organization_id)
);
create index reservations_business on public.marketplace_reservations(organization_id,starts_at,ends_at);
alter table public.marketplace_reservations enable row level security;
revoke all on public.marketplace_reservations from anon,authenticated;grant select on public.marketplace_reservations to authenticated;
create policy reservations_read on public.marketplace_reservations for select to authenticated using(customer_id=(select auth.uid()) or (app.is_org_member(organization_id) and app.sw_service(organization_id,'rental')) or app.sw_admin());

create table public.marketplace_audit_events (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),organization_id uuid references public.organizations(id),
 action text not null,entity_id uuid,detail jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.marketplace_audit_events enable row level security;
revoke all on public.marketplace_audit_events from anon,authenticated;grant select on public.marketplace_audit_events to authenticated;
create policy audit_read on public.marketplace_audit_events for select to authenticated using(app.sw_admin() or app.has_min_role(organization_id,'admin'));

-- Registration metadata is request input only. Provisioning occurs on approval.
create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb:=coalesce(new.raw_user_meta_data,'{}');s text[];
begin
 insert into public.profiles(id,full_name,email) values(new.id,left(btrim(coalesce(m->>'full_name','')),120),new.email) on conflict(id) do nothing;
 if m->>'account_type'='business' or char_length(coalesce(m->>'organization_name',''))>=2 then
  s:=case m->>'service_type' when 'dealership' then array['dealership'] when 'both' then array['dealership','rental'] else array['rental'] end;
  insert into public.business_applications(applicant_id,business_name,requested_services,country_code,city,region,address,description,business_phone,whatsapp_number_e164,registration_number)
  values(new.id,left(coalesce(nullif(m->>'business_name',''),m->>'organization_name'),120),s,coalesce(m->>'country_code','TZ'),left(coalesce(m->>'city',''),120),left(coalesce(m->>'region',''),120),left(coalesce(m->>'business_address',''),500),left(coalesce(m->>'business_description',''),4000),left(coalesce(m->>'business_phone',''),32),case when m->>'whatsapp_number_e164' ~ '^\+[1-9][0-9]{7,14}$' then m->>'whatsapp_number_e164' else null end,left(m->>'registration_number',120));
 end if;return new;
end;$$;
-- Existing onboarding endpoint must not allow an applicant to bypass approval.
create or replace function public.create_organization(p_name text,p_country text default null,p_currency text default null,p_time_zone text default null,p_locale text default null)
returns public.organizations language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Register your business with Swahivo and wait for service approval before opening a provider workspace.' using errcode='42501';
end;$$;

create function public.marketplace_account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=(select auth.uid());begin
 if u is null then raise exception 'Sign in required.' using errcode='42501';end if;
 return jsonb_build_object('is_admin',app.sw_admin(),'businesses',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('services',(select coalesce(jsonb_agg(s.service),'[]') from public.business_service_access s where s.organization_id=b.organization_id))) from public.marketplace_businesses b where exists(select 1 from public.organization_members m where m.organization_id=b.organization_id and m.user_id=u and m.status='active')),'[]'),'applications',coalesce((select jsonb_agg(to_jsonb(a)) from public.business_applications a where a.applicant_id=u),'[]'));
end;$$;

create function public.marketplace_review_application(p_application_id uuid,p_approve boolean,p_services text[],p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.business_applications;o public.organizations;s text;begin
 if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 select * into a from public.business_applications where id=p_application_id for update;
 if not found or a.status<>'pending' then raise exception 'This application is not pending.';end if;
 if p_approve then
  if cardinality(p_services) not between 1 and 2 or not p_services<@array['dealership','rental']::text[] or not p_services<@a.requested_services then raise exception 'Choose a requested service.';end if;
  if not exists(select 1 from auth.users where id=a.applicant_id and email_confirmed_at is not null) then raise exception 'The applicant must confirm their email first.';end if;
  o:=app.provision_organization(a.applicant_id,a.business_name,a.country_code,'TZS','Africa/Nairobi','en');
  insert into public.marketplace_businesses(organization_id,name,slug,city,region,country_code,address,description,business_phone,whatsapp_number_e164,whatsapp_enabled,approved) values(o.id,a.business_name,o.slug,a.city,a.region,a.country_code,a.address,a.description,nullif(a.business_phone,''),a.whatsapp_number_e164,a.whatsapp_number_e164 is not null,true);
  foreach s in array p_services loop insert into public.business_service_access(organization_id,service,approved_by) values(o.id,s,(select auth.uid())) on conflict do nothing;end loop;
 end if;
 update public.business_applications set status=case when p_approve then 'approved' else 'rejected' end,organization_id=o.id,decision_note=left(p_note,2000),decided_at=now(),decided_by=(select auth.uid()) where id=a.id;
 insert into public.marketplace_audit_events(actor_id,organization_id,action,entity_id,detail) values((select auth.uid()),o.id,case when p_approve then 'business.approved' else 'business.rejected' end,a.id,jsonb_build_object('services',p_services));
 return o.id;
end;$$;

create function public.marketplace_review_offer(p_offer_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 update public.marketplace_offers set status=case when p_approve then 'published' else 'rejected' end where id=p_offer_id and status='pending';
 if not found then raise exception 'Listing is not awaiting approval.';end if;
 insert into public.marketplace_audit_events(actor_id,action,entity_id) values((select auth.uid()),case when p_approve then 'listing.approved' else 'listing.rejected' end,p_offer_id);
end;$$;

create function public.marketplace_available_offers(p_from timestamptz,p_to timestamptz) returns setof uuid language plpgsql stable security definer set search_path='' as $$
begin
 if p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'Choose a valid rental period.';end if;
 return query select o.id from public.marketplace_offers o join public.vehicles v on v.id=o.vehicle_id join public.marketplace_businesses b on b.organization_id=o.organization_id where o.service='rental' and o.status='published' and b.approved and app.sw_service(o.organization_id,'rental') and v.archived_at is null and v.status='available' and not exists(select 1 from public.rentals r where r.vehicle_id=o.vehicle_id and r.status in ('reserved','active') and tstzrange(r.starts_at,r.ends_at,'[)')&&tstzrange(p_from,p_to,'[)'));
end;$$;

create function public.marketplace_send_enquiry(p_offer_id uuid,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());e uuid;n text;email text;begin
 if u is null then raise exception 'Sign in to send an enquiry.' using errcode='42501';end if;
 if (select count(*) from public.marketplace_enquiries where customer_id=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Please wait before sending more enquiries.';end if;
 select * into o from public.marketplace_offers where id=p_offer_id and status='published' and app.sw_service(organization_id,service);if not found then raise exception 'This listing is not available.';end if;
 select full_name,p.email into n,email from public.profiles p where id=u;
 insert into public.marketplace_enquiries(organization_id,offer_id,customer_id,service,message,customer_name,contact_email) values(o.organization_id,o.id,u,o.service,btrim(p_message),coalesce(n,''),coalesce(email,'')) returning id into e;
 insert into public.crm_leads(organization_id,service,name,email,stage,source,notes) values(o.organization_id,o.service,coalesce(nullif(n,''),'Marketplace customer'),email,'new','marketplace_enquiry',left(p_message,4000));
 return e;
end;$$;

create function public.marketplace_request_booking(p_offer_id uuid,p_from timestamptz,p_to timestamptz,p_pickup text,p_return text,p_driver_name text,p_accept_terms boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());v_id uuid;v_days integer;begin
 if u is null then raise exception 'Sign in to request a booking.' using errcode='42501';end if;
 if not p_accept_terms or char_length(btrim(p_driver_name))<2 or char_length(btrim(p_pickup))<2 or char_length(btrim(p_return))<2 then raise exception 'Complete driver, pickup, return and terms details.';end if;
 if p_from<now()-interval '5 minutes' or p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'Choose a valid future rental period.';end if;
 if (select count(*) from public.marketplace_reservations where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before making more booking requests.';end if;
 select * into o from public.marketplace_offers where id=p_offer_id and service='rental' and status='published' for update;
 if not found or not app.sw_service(o.organization_id,'rental') then raise exception 'Rental listing unavailable.';end if;
 if not exists(select 1 from public.marketplace_available_offers(p_from,p_to) available where available=o.id) then raise exception 'This vehicle is not available for those dates.' using errcode='23P01';end if;
 v_days:=greatest(1,ceil(extract(epoch from p_to-p_from)/86400)::integer);
 insert into public.marketplace_reservations(organization_id,offer_id,customer_id,starts_at,ends_at,pickup_location,return_location,driver_name,daily_rate_minor,total_minor,deposit_minor,currency) values(o.organization_id,o.id,u,p_from,p_to,left(p_pickup,160),left(p_return,160),left(p_driver_name,160),o.price_minor,v_days*o.price_minor,o.deposit_minor,o.currency) returning id into v_id;
 return v_id;
end;$$;

create function public.marketplace_decide_booking(p_reservation_id uuid,p_confirm boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.marketplace_reservations;o public.marketplace_offers;c uuid;r public.rentals;begin
 select * into b from public.marketplace_reservations where id=p_reservation_id for update;
 if not found or not app.has_min_role(b.organization_id,'staff') or not app.sw_service(b.organization_id,'rental') then raise exception 'Rental provider permission required.' using errcode='42501';end if;
 if b.status<>'requested' then raise exception 'Booking is not awaiting a decision.';end if;
 if not p_confirm then update public.marketplace_reservations set status='declined' where id=b.id;return null;end if;
 select * into o from public.marketplace_offers where id=b.offer_id;
 perform 1 from public.vehicles where id=o.vehicle_id for update;
 if not exists(select 1 from public.marketplace_available_offers(b.starts_at,b.ends_at) available where available=o.id) then raise exception 'The vehicle is no longer available.' using errcode='23P01';end if;
 insert into public.customers(organization_id,first_name,last_name,email) select b.organization_id,split_part(b.driver_name,' ',1),coalesce(nullif(substr(b.driver_name,length(split_part(b.driver_name,' ',1))+2),''),'Customer'),u.email from auth.users u where u.id=b.customer_id returning id into c;
 insert into public.rentals(organization_id,vehicle_id,customer_id,status,starts_at,ends_at,pickup_location,return_location,currency,daily_rate_minor,billable_days,deposit_minor) values(b.organization_id,o.vehicle_id,c,'draft',b.starts_at,b.ends_at,b.pickup_location,b.return_location,b.currency,b.daily_rate_minor,greatest(1,ceil(extract(epoch from b.ends_at-b.starts_at)/86400)::integer),b.deposit_minor) returning * into r;
 insert into public.rental_drivers(organization_id,rental_id,customer_id,driver_role) values(b.organization_id,r.id,c,'primary');
 insert into public.rental_line_items(organization_id,rental_id,kind,description,quantity,unit_amount_minor,amount_minor,sort_order) values(b.organization_id,r.id,'base_rental','Marketplace rental',greatest(1,ceil(extract(epoch from b.ends_at-b.starts_at)/86400)::integer),b.daily_rate_minor,b.total_minor,0);
 perform public.rental_confirm(r.id);
 update public.marketplace_reservations set status='confirmed',rental_id=r.id where id=b.id;
 return r.id;
end;$$;

create function public.marketplace_admin_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 return jsonb_build_object('businesses',(select count(*) from public.marketplace_businesses),'pending_applications',(select count(*) from public.business_applications where status='pending'),'sale_listings',(select count(*) from public.marketplace_offers where service='dealership'),'rental_listings',(select count(*) from public.marketplace_offers where service='rental'),'enquiries',(select count(*) from public.marketplace_enquiries),'reservations',(select count(*) from public.marketplace_reservations),'users',(select count(*) from auth.users),'active_rentals',(select count(*) from public.rentals where status='active'));
end;$$;

create function public.marketplace_update_package(p_package_id uuid,p_monthly_tzs bigint,p_listing_limit integer,p_published boolean,p_stripe_price_id text default null) returns void language plpgsql security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 update public.service_packages set monthly_tzs=p_monthly_tzs,listing_limit=p_listing_limit,published=p_published,stripe_price_id=nullif(p_stripe_price_id,'') where id=p_package_id;
 if not found then raise exception 'Package not found.';end if;
end;$$;

-- Keep legacy rental operations intact, but enforce actual service entitlement
-- in addition to their existing tenant and staff-role policies.
do $$declare t record;begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='organization_id' and (table_name in ('vehicles','vehicle_documents','vehicle_images','rentals','rental_drivers','rental_line_items','rental_contracts','rental_condition_photos','payments','expenses','expense_attachments','financing_agreements','financing_payments','financing_documents') or table_name like 'gps_%') and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=table_name and c.relkind in ('r','p')) loop
  execute format('create policy swahivo_rental_entitlement on public.%I as restrictive for all to authenticated using (app.sw_service(organization_id,''rental'')) with check (app.sw_service(organization_id,''rental''))',t.table_name);
 end loop;
end;$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('marketplace-media','marketplace-media',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy swahivo_media_read on storage.objects for select to anon,authenticated using(bucket_id='marketplace-media' and (exists(select 1 from public.marketplace_offers o where o.organization_id::text=split_part(name,'/',1) and o.id::text=split_part(name,'/',2) and o.status='published') or exists(select 1 from public.marketplace_businesses b where b.organization_id::text=split_part(name,'/',1) and b.approved and split_part(name,'/',2)='profile')));
create policy swahivo_media_member_read on storage.objects for select to authenticated using(bucket_id='marketplace-media' and app.is_org_member(app.organization_id_from_storage_path(name)));
create policy swahivo_media_insert on storage.objects for insert to authenticated with check(bucket_id='marketplace-media' and app.has_min_role(app.organization_id_from_storage_path(name),'manager'));
create policy swahivo_media_delete on storage.objects for delete to authenticated using(bucket_id='marketplace-media' and app.has_min_role(app.organization_id_from_storage_path(name),'manager'));

-- Explicit RPC grants; functions in app remain outside the exposed API.
revoke all on function public.marketplace_account(),public.marketplace_review_application(uuid,boolean,text[],text),public.marketplace_review_offer(uuid,boolean),public.marketplace_send_enquiry(uuid,text),public.marketplace_request_booking(uuid,timestamptz,timestamptz,text,text,text,boolean),public.marketplace_decide_booking(uuid,boolean),public.marketplace_admin_summary(),public.marketplace_update_package(uuid,bigint,integer,boolean,text) from public,anon;
grant execute on function public.marketplace_account(),public.marketplace_review_application(uuid,boolean,text[],text),public.marketplace_review_offer(uuid,boolean),public.marketplace_send_enquiry(uuid,text),public.marketplace_request_booking(uuid,timestamptz,timestamptz,text,text,text,boolean),public.marketplace_decide_booking(uuid,boolean),public.marketplace_admin_summary(),public.marketplace_update_package(uuid,bigint,integer,boolean,text) to authenticated;
revoke all on function public.marketplace_available_offers(timestamptz,timestamptz) from public;
grant execute on function public.marketplace_available_offers(timestamptz,timestamptz) to anon,authenticated;
revoke all on function app.sw_guard_offer(),app.sw_guard_lead() from public,anon,authenticated;

-- Realtime is optional per-project; add only our scoped customer/provider rows.
do $$declare t text;begin
 foreach t in array array['marketplace_enquiries','marketplace_reservations','crm_leads'] loop
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;
end;$$;
