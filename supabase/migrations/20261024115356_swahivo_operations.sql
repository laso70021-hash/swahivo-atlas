-- Service expansion, commercial records, and approval audit access.
set search_path=public,extensions,pg_temp;
create function public.marketplace_audit_log() returns setof public.marketplace_audit_events language plpgsql stable security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
return query select * from public.marketplace_audit_events order by created_at desc limit 500;end;$$;
create function public.marketplace_request_services(p_organization_id uuid,p_services text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.marketplace_businesses;v_id uuid;begin
if not app.has_min_role(p_organization_id,'owner') then raise exception 'Business owner required.' using errcode='42501';end if;
if cardinality(p_services) not between 1 and 2 or not p_services<@array['dealership','rental']::text[] then raise exception 'Choose valid services.';end if;
select * into b from public.marketplace_businesses where organization_id=p_organization_id;
if not found then raise exception 'Business profile not found.';end if;
insert into public.business_applications(applicant_id,business_name,requested_services,organization_id,country_code,city,region,address,description,business_phone,whatsapp_number_e164)
values((select auth.uid()),b.name,p_services,b.organization_id,b.country_code,b.city,b.region,b.address,b.description,coalesce(b.business_phone,''),b.whatsapp_number_e164) returning id into v_id;return v_id;
end;$$;
create or replace function public.marketplace_review_application(p_application_id uuid,p_approve boolean,p_services text[],p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.business_applications;o public.organizations;s text;begin
if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
select * into a from public.business_applications where id=p_application_id for update;
if not found or a.status<>'pending' then raise exception 'This application is not pending.';end if;
if p_approve then
 if coalesce(cardinality(p_services),0) not between 1 and 2 or not p_services<@array['dealership','rental']::text[] or not p_services<@a.requested_services then raise exception 'Choose requested services.';end if;
 if not exists(select 1 from auth.users where id=a.applicant_id and email_confirmed_at is not null) then raise exception 'Email confirmation required.';end if;
 if a.organization_id is null then
  o:=app.provision_organization(a.applicant_id,a.business_name,a.country_code,'TZS','Africa/Nairobi','en');
  insert into public.marketplace_businesses(organization_id,name,slug,city,region,country_code,address,description,business_phone,whatsapp_number_e164,whatsapp_enabled,approved) values(o.id,a.business_name,o.slug,a.city,a.region,a.country_code,a.address,a.description,nullif(a.business_phone,''),a.whatsapp_number_e164,a.whatsapp_number_e164 is not null,true);
 else
  select * into o from public.organizations where id=a.organization_id;
  if not exists(select 1 from public.organization_members where organization_id=o.id and user_id=a.applicant_id and role='owner' and status='active') then raise exception 'The applicant no longer owns this business.';end if;
 end if;
 foreach s in array p_services loop insert into public.business_service_access(organization_id,service,approved_by) values(o.id,s,(select auth.uid())) on conflict do nothing;end loop;
end if;
update public.business_applications set status=case when p_approve then 'approved' else 'rejected' end,organization_id=coalesce(o.id,a.organization_id),decision_note=left(p_note,2000),decided_at=now(),decided_by=(select auth.uid()) where id=a.id;
insert into public.marketplace_audit_events(actor_id,organization_id,action,entity_id,detail) values((select auth.uid()),coalesce(o.id,a.organization_id),case when p_approve then 'business.approved' else 'business.rejected' end,a.id,jsonb_build_object('services',p_services));return o.id;
end;$$;

-- Domain-specific commercial workflows. No automatic payments or credit approval.
create table public.marketplace_orders (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,
 customer_id uuid references auth.users(id),buyer_name text not null check(char_length(buyer_name) between 2 and 160),buyer_email text,
 amount_minor bigint not null check(amount_minor>=0),currency text not null,
 status text not null default 'pending' check(status in ('pending','confirmed','completed','cancelled')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending_verification','paid')),
 payment_reference text,notes text,created_at timestamptz not null default now(),
 foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id)
);
alter table public.marketplace_orders enable row level security;
revoke all on public.marketplace_orders from anon,authenticated;grant select on public.marketplace_orders to authenticated;
create policy orders_read on public.marketplace_orders for select to authenticated using(customer_id=(select auth.uid()) or (app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership')) or app.sw_admin());

create table public.marketplace_test_drives (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,customer_id uuid not null references auth.users(id),
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),notes text,
 status text not null default 'requested' check(status in ('requested','confirmed','completed','cancelled')),
 created_at timestamptz not null default now(),foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id),
 exclude using gist(offer_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(status='confirmed')
);
alter table public.marketplace_test_drives enable row level security;revoke all on public.marketplace_test_drives from anon,authenticated;
grant select,update(status) on public.marketplace_test_drives to authenticated;
create policy test_drives_read on public.marketplace_test_drives for select to authenticated using(customer_id=(select auth.uid()) or (app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership')) or app.sw_admin());
create policy test_drives_update on public.marketplace_test_drives for update to authenticated using(app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership')) with check(app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership'));

create table public.marketplace_finance_requests (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,customer_id uuid not null references auth.users(id),
 message text not null check(char_length(message) between 3 and 4000),
 status text not null default 'new' check(status in ('new','contacted','referred','closed')),
 created_at timestamptz not null default now(),foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id)
);
alter table public.marketplace_finance_requests enable row level security;revoke all on public.marketplace_finance_requests from anon,authenticated;
grant select,update(status) on public.marketplace_finance_requests to authenticated;
create policy finance_requests_read on public.marketplace_finance_requests for select to authenticated using(customer_id=(select auth.uid()) or (app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership')) or app.sw_admin());
create policy finance_requests_update on public.marketplace_finance_requests for update to authenticated using(app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership')) with check(app.is_org_member(organization_id) and app.sw_service(organization_id,'dealership'));

create table public.marketplace_support_tickets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),
 subject text not null check(char_length(subject) between 3 and 200),message text not null check(char_length(message) between 3 and 8000),
 status text not null default 'open' check(status in ('open','in_progress','resolved')),response text,
 created_at timestamptz not null default now()
);
alter table public.marketplace_support_tickets enable row level security;revoke all on public.marketplace_support_tickets from anon,authenticated;
grant select,insert(user_id,subject,message),update(status,response) on public.marketplace_support_tickets to authenticated;
create policy support_read on public.marketplace_support_tickets for select to authenticated using(user_id=(select auth.uid()) or app.sw_admin());
create policy support_create on public.marketplace_support_tickets for insert to authenticated with check(user_id=(select auth.uid()));
create policy support_update on public.marketplace_support_tickets for update to authenticated using(app.sw_admin()) with check(app.sw_admin());

create table public.marketplace_promotions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 status text not null default 'requested' check(status in ('requested','approved','rejected','expired')),
 note text,created_at timestamptz not null default now(),foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id)
);
alter table public.marketplace_promotions enable row level security;revoke all on public.marketplace_promotions from anon,authenticated;
grant select,insert(organization_id,offer_id,starts_at,ends_at,note) on public.marketplace_promotions to authenticated;
create policy promotions_read on public.marketplace_promotions for select to authenticated using(app.is_org_member(organization_id) or app.sw_admin());
create policy promotions_create on public.marketplace_promotions for insert to authenticated with check(app.has_min_role(organization_id,'manager') and exists(select 1 from public.marketplace_offers o where o.id=offer_id and o.organization_id=marketplace_promotions.organization_id and app.sw_service(o.organization_id,o.service)));

create table public.marketplace_reviews (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 author_id uuid not null default auth.uid() references auth.users(id),reservation_id uuid references public.marketplace_reservations(id),order_id uuid references public.marketplace_orders(id),
 rating integer not null check(rating between 1 and 5),body text not null check(char_length(body) between 3 and 4000),
 status text not null default 'pending' check(status in ('pending','published','rejected')),created_at timestamptz not null default now(),
 check(num_nonnulls(reservation_id,order_id)=1),unique(author_id,reservation_id),unique(author_id,order_id)
);
alter table public.marketplace_reviews enable row level security;revoke all on public.marketplace_reviews from anon,authenticated;
grant select on public.marketplace_reviews to anon,authenticated;grant insert(author_id,organization_id,reservation_id,order_id,rating,body) on public.marketplace_reviews to authenticated;
create policy reviews_public on public.marketplace_reviews for select to anon,authenticated using(status='published');
create policy reviews_author on public.marketplace_reviews for select to authenticated using(author_id=(select auth.uid()) or app.is_org_member(organization_id) or app.sw_admin());
create policy reviews_create on public.marketplace_reviews for insert to authenticated with check(author_id=(select auth.uid()) and (exists(select 1 from public.marketplace_reservations r join public.rentals x on x.id=r.rental_id where r.id=reservation_id and r.customer_id=(select auth.uid()) and r.organization_id=marketplace_reviews.organization_id and x.status='completed') or exists(select 1 from public.marketplace_orders o where o.id=order_id and o.customer_id=(select auth.uid()) and o.organization_id=marketplace_reviews.organization_id and o.status='completed')));

create table public.marketplace_contact_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,offer_id uuid not null,
 actor_id uuid references auth.users(id),channel text not null check(channel in ('whatsapp','phone')),
 created_at timestamptz not null default now(),foreign key(offer_id,organization_id) references public.marketplace_offers(id,organization_id)
);
alter table public.marketplace_contact_events enable row level security;revoke all on public.marketplace_contact_events from anon,authenticated;
grant select on public.marketplace_contact_events to authenticated;
create policy contact_events_read on public.marketplace_contact_events for select to authenticated using(app.is_org_member(organization_id) or app.sw_admin());

create function public.marketplace_record_contact(p_offer_id uuid,p_channel text) returns void language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());begin
if u is null then return;end if;
if p_channel not in ('whatsapp','phone') then raise exception 'Invalid contact channel.';end if;
if (select count(*) from public.marketplace_contact_events where actor_id=u and created_at>now()-interval '1 hour')>=60 then raise exception 'Contact event rate limit reached.';end if;
select * into o from public.marketplace_offers where id=p_offer_id and status='published';if not found then raise exception 'Listing unavailable.';end if;
insert into public.marketplace_contact_events(organization_id,offer_id,actor_id,channel) values(o.organization_id,o.id,u,p_channel);
end;$$;

create function public.marketplace_create_order(p_offer_id uuid,p_buyer_name text,p_buyer_email text default null,p_notes text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;v_id uuid;begin
select * into o from public.marketplace_offers where id=p_offer_id and service='dealership' for update;
if not found or not app.has_min_role(o.organization_id,'staff') or not app.sw_service(o.organization_id,'dealership') then raise exception 'Dealership permission required.' using errcode='42501';end if;
if o.status in ('sold','archived') then raise exception 'This vehicle is no longer for sale.';end if;
insert into public.marketplace_orders(organization_id,offer_id,buyer_name,buyer_email,amount_minor,currency,notes) values(o.organization_id,o.id,p_buyer_name,p_buyer_email,o.price_minor,o.currency,p_notes) returning id into v_id;return v_id;
end;$$;
create function public.marketplace_update_order(p_order_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare o public.marketplace_orders;begin
select * into o from public.marketplace_orders where id=p_order_id for update;
if not found or not app.has_min_role(o.organization_id,'manager') or not app.sw_service(o.organization_id,'dealership') then raise exception 'Dealership manager required.' using errcode='42501';end if;
if o.status in ('completed','cancelled') then raise exception 'This order is already final.';end if;
if p_status not in ('confirmed','completed','cancelled') then raise exception 'Invalid order status.';end if;
if p_status='completed' then
 if o.payment_status<>'paid' then raise exception 'A verified payment is required before completing the sale.';end if;
 update public.marketplace_offers set status='sold' where id=o.offer_id;
end if;
update public.marketplace_orders set status=p_status where id=o.id;
end;$$;

create function public.marketplace_customer_request(p_offer_id uuid,p_kind text,p_message text,p_from timestamptz default null,p_to timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());v_id uuid;begin
if u is null then raise exception 'Sign in required.' using errcode='42501';end if;
select * into o from public.marketplace_offers where id=p_offer_id and service='dealership' and status='published';if not found then raise exception 'Sale listing unavailable.';end if;
if p_kind='test_drive' then
 if p_from is null or p_to is null or p_from<now() or p_to<=p_from or p_to-p_from>interval '1 day' then raise exception 'Choose a valid test-drive appointment.';end if;
 if (select count(*) from public.marketplace_test_drives where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before requesting more appointments.';end if;
 insert into public.marketplace_test_drives(organization_id,offer_id,customer_id,starts_at,ends_at,notes) values(o.organization_id,o.id,u,p_from,p_to,left(p_message,4000)) returning id into v_id;
elsif p_kind='finance' then
 if (select count(*) from public.marketplace_finance_requests where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before requesting more information.';end if;
 insert into public.marketplace_finance_requests(organization_id,offer_id,customer_id,message) values(o.organization_id,o.id,u,left(p_message,4000)) returning id into v_id;
else raise exception 'Unsupported request type.';end if;return v_id;
end;$$;

create function public.marketplace_admin_moderate(p_kind text,p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
if p_kind='review' and p_status in ('published','rejected') then update public.marketplace_reviews set status=p_status where id=p_id;
elsif p_kind='promotion' and p_status in ('approved','rejected','expired') then
 update public.marketplace_promotions set status=p_status where id=p_id;
 update public.marketplace_offers set featured=(p_status='approved') where id=(select offer_id from public.marketplace_promotions where id=p_id);
else raise exception 'Unsupported moderation action.';end if;
insert into public.marketplace_audit_events(actor_id,action,entity_id,detail) values((select auth.uid()),p_kind||'.moderated',p_id,jsonb_build_object('status',p_status));
end;$$;

-- Foreign keys are indexed for scoped queries and safe parent deletes.
create index marketplace_orders_org on public.marketplace_orders(organization_id,created_at desc);
create index marketplace_drives_org on public.marketplace_test_drives(organization_id,starts_at);
create index marketplace_finance_org on public.marketplace_finance_requests(organization_id,created_at desc);
create index marketplace_tickets_user on public.marketplace_support_tickets(user_id,created_at desc);
create index marketplace_reviews_org on public.marketplace_reviews(organization_id,status);
create index marketplace_promotions_org on public.marketplace_promotions(organization_id,status);
create index marketplace_contacts_org on public.marketplace_contact_events(organization_id,created_at desc);

revoke all on function public.marketplace_audit_log(),public.marketplace_request_services(uuid,text[]),public.marketplace_record_contact(uuid,text),public.marketplace_create_order(uuid,text,text,text),public.marketplace_update_order(uuid,text),public.marketplace_customer_request(uuid,text,text,timestamptz,timestamptz),public.marketplace_admin_moderate(text,uuid,text) from public,anon;
grant execute on function public.marketplace_audit_log(),public.marketplace_request_services(uuid,text[]),public.marketplace_record_contact(uuid,text),public.marketplace_create_order(uuid,text,text,text),public.marketplace_update_order(uuid,text),public.marketplace_customer_request(uuid,text,text,timestamptz,timestamptz),public.marketplace_admin_moderate(text,uuid,text) to authenticated;
