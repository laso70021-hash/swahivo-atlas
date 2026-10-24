-- Unified provider onboarding, paid placements and administrator-controlled marketing.
set search_path=public,extensions,pg_temp;
alter table public.marketplace_businesses add column billing_required boolean not null default false;
alter table public.service_packages add column included_ad_days integer not null default 0 check(included_ad_days between 0 and 365);
create table public.marketplace_plan_selections(
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.business_applications(id) on delete cascade,
 service text not null check(service in ('dealership','rental')),package_id uuid not null references public.service_packages(id),
 amount_minor bigint not null check(amount_minor>=0),status text not null check(status in ('awaiting_payment','paid','free')),
 paid_reference text,paid_at timestamptz,created_at timestamptz not null default now(),unique(application_id,service)
);
create table public.marketplace_ad_placements(
 id text primary key,name text not null,description text not null,price_daily_minor bigint check(price_daily_minor>0),
 enabled boolean not null default false,allow_plan_credit boolean not null default true,max_days integer not null default 30 check(max_days between 1 and 90)
);
insert into public.marketplace_ad_placements(id,name,description) values
 ('home_hero','Homepage banner','Premium banner immediately below the homepage hero'),
 ('home_featured','Homepage featured vehicles','Sponsored vehicles on the main marketplace'),
 ('cars_top','Car sales marketplace','Sponsored placement above car search results'),
 ('rentals_top','Rental marketplace','Sponsored placement above rental search results'),
 ('provider_spotlight','Provider spotlight','Business advertisement on the homepage'),
 ('buyer_dashboard','Buyer dashboard','Sponsored offer on the buyer dashboard');
create table public.marketplace_campaigns(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 service text not null check(service in ('dealership','rental')),placement_id text not null references public.marketplace_ad_placements(id),
 offer_id uuid references public.marketplace_offers(id),title text not null check(char_length(title) between 3 and 120),
 description text not null default '' check(char_length(description)<=500),image_path text,
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),days integer not null check(days>0),
 amount_minor bigint not null check(amount_minor>=0),payment_status text not null check(payment_status in ('awaiting_payment','paid','included')),
 status text not null default 'pending' check(status in ('pending','approved','rejected','paused','cancelled')),
 review_note text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz
);
create table public.marketplace_payment_orders(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 selection_id uuid references public.marketplace_plan_selections(id) on delete cascade,
 campaign_id uuid references public.marketplace_campaigns(id) on delete cascade,
 amount_minor bigint not null check(amount_minor>0),currency text not null default 'TZS' check(currency='TZS'),
 status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 checkout_id text unique,payment_reference text,paid_at timestamptz,created_at timestamptz not null default now(),
 check(num_nonnulls(selection_id,campaign_id)=1)
);
create unique index payment_selection_unique on public.marketplace_payment_orders(selection_id) where status<>'cancelled';
create unique index payment_campaign_unique on public.marketplace_payment_orders(campaign_id) where status<>'cancelled';
create table public.marketplace_ad_events(
 campaign_id uuid not null references public.marketplace_campaigns(id) on delete cascade,
 kind text not null check(kind in ('impression','click')),visitor_hash text not null,event_day date not null default current_date,
 created_at timestamptz not null default now(),primary key(campaign_id,kind,visitor_hash,event_day)
);
create index sw_campaign_org on public.marketplace_campaigns(organization_id,created_at desc);
create index sw_campaign_delivery on public.marketplace_campaigns(placement_id,status,starts_at,ends_at);
create index sw_payment_owner on public.marketplace_payment_orders(user_id,created_at desc);
alter table public.marketplace_plan_selections enable row level security;
alter table public.marketplace_ad_placements enable row level security;
alter table public.marketplace_campaigns enable row level security;
alter table public.marketplace_payment_orders enable row level security;
alter table public.marketplace_ad_events enable row level security;
revoke all on public.marketplace_plan_selections,public.marketplace_ad_placements,public.marketplace_campaigns,public.marketplace_payment_orders,public.marketplace_ad_events from anon,authenticated;
grant select on public.marketplace_plan_selections,public.marketplace_campaigns,public.marketplace_payment_orders to authenticated;
grant select on public.marketplace_ad_placements to anon,authenticated;
create policy plan_selection_read on public.marketplace_plan_selections for select to authenticated using(app.sw_admin() or exists(select 1 from public.business_applications a where a.id=application_id and a.applicant_id=(select auth.uid())));
create policy placements_read on public.marketplace_ad_placements for select to anon,authenticated using(true);
create policy campaigns_read on public.marketplace_campaigns for select to authenticated using(app.is_org_member(organization_id) or app.sw_admin());
create policy payments_read on public.marketplace_payment_orders for select to authenticated using(user_id=(select auth.uid()) or app.sw_admin());

create function public.marketplace_select_plan(p_application_id uuid,p_package_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.business_applications;p public.service_packages;s public.marketplace_plan_selections;v_id uuid;
begin
 select * into a from public.business_applications where id=p_application_id for update;
 if not found or a.applicant_id is distinct from (select auth.uid()) or a.status<>'pending' then raise exception 'Your pending business application is required.' using errcode='42501';end if;
 select * into p from public.service_packages where id=p_package_id and published and monthly_tzs is not null;
 if not found or not p.service=any(a.requested_services) then raise exception 'Choose a published package for the requested service.';end if;
 select * into s from public.marketplace_plan_selections where application_id=a.id and service=p.service;
 if found and s.status='paid' then raise exception 'This service has already been paid. Contact support to change the plan.';end if;
 if s.package_id=p.id then return s.id;end if;
 update public.marketplace_payment_orders set status='cancelled' where selection_id=s.id and status='pending';
 insert into public.marketplace_plan_selections(application_id,service,package_id,amount_minor,status) values(a.id,p.service,p.id,p.monthly_tzs*100,case when p.monthly_tzs=0 then 'free' else 'awaiting_payment' end)
 on conflict(application_id,service) do update set package_id=excluded.package_id,amount_minor=excluded.amount_minor,status=excluded.status returning id into v_id;
 if p.monthly_tzs>0 then insert into public.marketplace_payment_orders(user_id,selection_id,amount_minor) values(a.applicant_id,v_id,p.monthly_tzs*100);end if;
 return v_id;
end;$$;

-- Preserve the existing approval implementation, accessible only through this guarded wrapper.
alter function public.marketplace_review_application(uuid,boolean,text[],text) set schema app;
alter function app.marketplace_review_application(uuid,boolean,text[],text) rename to sw_review_application;
revoke all on function app.sw_review_application(uuid,boolean,text[],text) from public,anon,authenticated;
create function public.marketplace_review_application(p_application_id uuid,p_approve boolean,p_services text[],p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid;s text;a public.business_applications;begin
 if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 select * into a from public.business_applications where id=p_application_id for update;
 if p_approve then
  foreach s in array p_services loop
   if not exists(select 1 from public.marketplace_plan_selections where application_id=p_application_id and service=s and status in ('paid','free')) then raise exception 'Provider must choose a plan and complete any required payment before approval.';end if;
  end loop;
 end if;
 v_org:=app.sw_review_application(p_application_id,p_approve,p_services,p_note);
 if p_approve then
  update public.marketplace_businesses set billing_required=true where organization_id=v_org and a.organization_id is null;
  insert into public.marketplace_subscriptions(organization_id,service,package_id,status,expires_at,paid_reference,provider)
  select v_org,s.service,s.package_id,'active',case when s.amount_minor=0 then null else now()+interval '30 days' end,s.paid_reference,case when s.amount_minor=0 then 'free' else 'initial_payment' end
  from public.marketplace_plan_selections s where s.application_id=p_application_id and s.service=any(p_services)
  on conflict(organization_id,service) do update set package_id=excluded.package_id,status='active',expires_at=excluded.expires_at,paid_reference=excluded.paid_reference,provider=excluded.provider,updated_at=now();
 end if;
 return v_org;
end;$$;
create or replace function app.sw_service(p_org uuid,p_service text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_service_access a join public.marketplace_businesses b on b.organization_id=a.organization_id where a.organization_id=p_org and a.service=p_service and (not b.billing_required or exists(select 1 from public.marketplace_subscriptions s where s.organization_id=p_org and s.service=p_service and s.status='active' and (s.expires_at is null or s.expires_at>now()))));
$$;

create function public.marketplace_create_campaign(p_org uuid,p_service text,p_placement text,p_offer uuid,p_title text,p_description text,p_image text,p_from timestamptz,p_to timestamptz,p_use_credit boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare pl public.marketplace_ad_placements;v_days integer;v_amount bigint;v_id uuid;v_allowance integer:=0;v_used integer:=0;begin
 if not app.has_min_role(p_org,'manager') or not app.sw_service(p_org,p_service) then raise exception 'Approved provider permission required.' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,42));
 select * into pl from public.marketplace_ad_placements where id=p_placement and enabled;
 if not found then raise exception 'This advertising placement is not available.';end if;
 if p_from is null or p_to is null or p_from<now()-interval '5 minutes' or p_to<=p_from then raise exception 'Choose a future advertising period.';end if;
 v_days:=ceil(extract(epoch from p_to-p_from)/86400)::integer;
 if v_days>pl.max_days then raise exception 'This campaign exceeds the placement duration limit.';end if;
 if p_offer is not null and not exists(select 1 from public.marketplace_offers where id=p_offer and organization_id=p_org and service=p_service and status='published') then raise exception 'Choose your own published listing.';end if;
 if p_placement in ('home_featured','cars_top','rentals_top') and p_offer is null then raise exception 'This placement requires a published vehicle listing.';end if;
 if (p_placement='cars_top' and p_service<>'dealership') or (p_placement='rentals_top' and p_service<>'rental') then raise exception 'Placement does not match the service.';end if;
 if p_image is not null and (split_part(p_image,'/',1)<>p_org::text or not exists(select 1 from storage.objects where bucket_id='marketplace-ads' and name=p_image)) then raise exception 'Upload the advertising image to your own business.';end if;
 if p_image is null and p_offer is null then raise exception 'Business advertisements require an image.';end if;
 if p_use_credit is true then
  if not pl.allow_plan_credit then raise exception 'This placement requires a separate payment.';end if;
  select p.included_ad_days into v_allowance from public.marketplace_subscriptions s join public.service_packages p on p.id=s.package_id where s.organization_id=p_org and s.service=p_service and s.status='active' and (s.expires_at is null or s.expires_at>=p_to);
  select coalesce(sum(days),0) into v_used from public.marketplace_campaigns where organization_id=p_org and service=p_service and payment_status='included' and status not in ('rejected','cancelled') and created_at>=date_trunc('month',now());
  if coalesce(v_allowance,0)-v_used<v_days then raise exception 'Not enough included advertising days remain this month.';end if;
  v_amount:=0;
 else
  if pl.price_daily_minor is null then raise exception 'Administrator must configure this placement price first.';end if;
  v_amount:=pl.price_daily_minor*v_days;
 end if;
 insert into public.marketplace_campaigns(organization_id,service,placement_id,offer_id,title,description,image_path,starts_at,ends_at,days,amount_minor,payment_status,created_by)
 values(p_org,p_service,p_placement,p_offer,btrim(p_title),coalesce(p_description,''),p_image,p_from,p_to,v_days,v_amount,case when p_use_credit then 'included' else 'awaiting_payment' end,(select auth.uid())) returning id into v_id;
 if v_amount>0 then insert into public.marketplace_payment_orders(user_id,campaign_id,amount_minor) values((select auth.uid()),v_id,v_amount);end if;
 return v_id;
end;$$;

create function public.marketplace_admin_marketing(p_action text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.marketplace_campaigns;begin
 if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 if p_action='create_placement' then
  insert into public.marketplace_ad_placements(id,name,description,price_daily_minor,enabled,allow_plan_credit,max_days)
  values(p_data->>'id',p_data->>'name',p_data->>'description',nullif(p_data->>'price_daily_minor','')::bigint,(p_data->>'enabled')::boolean,(p_data->>'allow_plan_credit')::boolean,(p_data->>'max_days')::integer);
 elsif p_action='placement' then
  update public.marketplace_ad_placements set price_daily_minor=nullif(p_data->>'price_daily_minor','')::bigint,enabled=(p_data->>'enabled')::boolean,allow_plan_credit=(p_data->>'allow_plan_credit')::boolean,max_days=(p_data->>'max_days')::integer where id=p_data->>'id';
 elsif p_action='allowance' then
  update public.service_packages set included_ad_days=(p_data->>'included_ad_days')::integer where id=(p_data->>'id')::uuid;
 elsif p_action='campaign' then
  select * into c from public.marketplace_campaigns where id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'Campaign not found.';end if;
  if p_data->>'status' not in ('approved','rejected','paused') then raise exception 'Invalid campaign action.';end if;
  if p_data->>'status'='approved' and c.payment_status not in ('paid','included') then raise exception 'Payment or an included plan allowance is required before approval.';end if;
  update public.marketplace_campaigns set status=p_data->>'status',review_note=left(p_data->>'note',2000),reviewed_by=(select auth.uid()),reviewed_at=now() where id=c.id;
 else raise exception 'Unknown marketing action.';end if;
 insert into public.marketplace_audit_events(actor_id,action,detail) values((select auth.uid()),'marketing.'||p_action,p_data);
end;$$;

create function app.sw_settle_payment(p_id uuid,p_reference text,p_amount bigint,p_source text) returns void language plpgsql security definer set search_path='' as $$
declare o public.marketplace_payment_orders;begin
 select * into o from public.marketplace_payment_orders where id=p_id for update;
 if not found or o.status='cancelled' then raise exception 'Payment order is unavailable.';end if;
 if o.status='paid' then return;end if;
 if p_amount is null or p_amount<>o.amount_minor or char_length(btrim(coalesce(p_reference,'')))<5 then raise exception 'Matching received amount and a payment reference are required.';end if;
 update public.marketplace_payment_orders set status='paid',payment_reference=p_reference,paid_at=now() where id=o.id;
 update public.marketplace_plan_selections set status='paid',paid_reference=p_reference,paid_at=now() where id=o.selection_id;
 update public.marketplace_campaigns set payment_status='paid' where id=o.campaign_id;
 insert into public.marketplace_audit_events(actor_id,action,entity_id,detail) values((select auth.uid()),'payment.received',o.id,jsonb_build_object('reference',p_reference,'amount_minor',p_amount,'source',p_source));
end;$$;
revoke all on function app.sw_settle_payment(uuid,text,bigint,text) from public,anon,authenticated;
create function public.marketplace_admin_receive_payment(p_id uuid,p_reference text,p_amount bigint) returns void language plpgsql security definer set search_path='' as $$
begin if not app.sw_admin() then raise exception 'Platform administrator required.' using errcode='42501';end if;
 perform app.sw_settle_payment(p_id,p_reference,p_amount,'administrator_verified_offline_receipt');end;$$;
create function public.marketplace_settle_checkout(p_id uuid,p_checkout text,p_reference text,p_amount bigint,p_currency text) returns void language plpgsql security definer set search_path='' as $$
begin if p_currency is distinct from 'TZS' or not exists(select 1 from public.marketplace_payment_orders where id=p_id and checkout_id=p_checkout) then raise exception 'Checkout mismatch.';end if;
 perform app.sw_settle_payment(p_id,p_reference,p_amount,'stripe_verified_checkout');end;$$;
revoke all on function public.marketplace_settle_checkout(uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.marketplace_settle_checkout(uuid,text,text,bigint,text) to service_role;

create function public.marketplace_ad_feed(p_placement text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]') from (
 select c.id,c.title,c.description,c.image_path,c.ends_at,b.name as business_name,
 case when o.id is not null then '/'||case when c.service='rental' then 'rentals' else 'cars' end||'/'||o.slug else '/providers/'||b.slug end as destination,
 case when c.image_path is not null then 'marketplace-ads' else 'marketplace-media' end as image_bucket,
 coalesce(c.image_path,o.images[1],b.banner_path,b.logo_path) as display_image
 from public.marketplace_campaigns c join public.marketplace_businesses b on b.organization_id=c.organization_id
 join public.marketplace_ad_placements p on p.id=c.placement_id left join public.marketplace_offers o on o.id=c.offer_id
 where c.placement_id=p_placement and p.enabled and c.status='approved' and c.payment_status in ('paid','included') and c.starts_at<=now() and c.ends_at>now() and b.approved and app.sw_service(c.organization_id,c.service) and (c.offer_id is null or o.status='published')
 order by c.created_at desc limit 6)x;
$$;
create function public.marketplace_ad_event(p_id uuid,p_kind text,p_visitor text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_kind not in ('impression','click') or p_visitor is null or char_length(p_visitor) not between 16 and 80 then return;end if;
 if not exists(select 1 from public.marketplace_campaigns c join public.marketplace_ad_placements p on p.id=c.placement_id where c.id=p_id and p.enabled and c.status='approved' and c.payment_status in ('paid','included') and c.starts_at<=now() and c.ends_at>now() and app.sw_service(c.organization_id,c.service) and exists(select 1 from public.marketplace_businesses b where b.organization_id=c.organization_id and b.approved)) then return;end if;
 insert into public.marketplace_ad_events(campaign_id,kind,visitor_hash) values(p_id,p_kind,md5(p_visitor)) on conflict do nothing;
end;$$;
create function public.marketplace_campaign_stats(p_org uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not app.sw_admin() and (p_org is null or not app.is_org_member(p_org)) then raise exception 'Provider access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from(select c.id,count(e.*) filter(where e.kind='impression') as impressions,count(e.*) filter(where e.kind='click') as clicks from public.marketplace_campaigns c left join public.marketplace_ad_events e on e.campaign_id=c.id where (p_org is null or c.organization_id=p_org) group by c.id)x),'[]');
end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('marketplace-ads','marketplace-ads',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy ad_media_owner on storage.objects for select to authenticated using(bucket_id='marketplace-ads' and app.is_org_member(app.organization_id_from_storage_path(name)));
create policy ad_media_admin on storage.objects for select to authenticated using(bucket_id='marketplace-ads' and app.sw_admin());
create policy ad_media_upload on storage.objects for insert to authenticated with check(bucket_id='marketplace-ads' and app.has_min_role(app.organization_id_from_storage_path(name),'manager'));
create policy ad_media_remove on storage.objects for delete to authenticated using(bucket_id='marketplace-ads' and app.has_min_role(app.organization_id_from_storage_path(name),'manager'));
create policy ad_media_published on storage.objects for select to anon,authenticated using(bucket_id='marketplace-ads' and false);
-- The safe helper avoids exposing private campaign rows merely to serve an approved creative.
create function app.sw_ad_image(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.marketplace_campaigns c join public.marketplace_ad_placements p on p.id=c.placement_id where c.image_path=p_name and p.enabled and c.status='approved' and c.payment_status in ('paid','included') and c.starts_at<=now() and c.ends_at>now() and app.sw_service(c.organization_id,c.service) and exists(select 1 from public.marketplace_businesses b where b.organization_id=c.organization_id and b.approved) and (c.offer_id is null or exists(select 1 from public.marketplace_offers o where o.id=c.offer_id and o.status='published')));
$$;
revoke all on function app.sw_ad_image(text) from public;grant execute on function app.sw_ad_image(text) to anon,authenticated;
alter policy ad_media_published on storage.objects using(bucket_id='marketplace-ads' and app.sw_ad_image(name));

revoke all on function public.marketplace_select_plan(uuid,uuid),public.marketplace_review_application(uuid,boolean,text[],text),public.marketplace_create_campaign(uuid,text,text,uuid,text,text,text,timestamptz,timestamptz,boolean),public.marketplace_admin_marketing(text,jsonb),public.marketplace_admin_receive_payment(uuid,text,bigint),public.marketplace_campaign_stats(uuid) from public,anon;
grant execute on function public.marketplace_select_plan(uuid,uuid),public.marketplace_review_application(uuid,boolean,text[],text),public.marketplace_create_campaign(uuid,text,text,uuid,text,text,text,timestamptz,timestamptz,boolean),public.marketplace_admin_marketing(text,jsonb),public.marketplace_admin_receive_payment(uuid,text,bigint),public.marketplace_campaign_stats(uuid) to authenticated;
revoke all on function public.marketplace_ad_feed(text),public.marketplace_ad_event(uuid,text,text) from public;
grant execute on function public.marketplace_ad_feed(text),public.marketplace_ad_event(uuid,text,text) to anon,authenticated;
