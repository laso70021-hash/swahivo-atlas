-- Fix subscription logic: users with free plans don't need active subscription
set search_path = public, extensions, pg_temp;

-- Update marketplace_review_application to only set billing_required for paid plans
create or replace function public.marketplace_review_application(p_application_id uuid,p_approve boolean,p_services text[],p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
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
  update public.marketplace_businesses set billing_required=exists(select 1 from public.marketplace_plan_selections s where s.application_id=p_application_id and s.service=any(p_services) and s.amount_minor>0) where organization_id=v_org and a.organization_id is null;
  insert into public.marketplace_subscriptions(organization_id,service,package_id,status,expires_at,paid_reference,provider)
  select v_org,s.service,s.package_id,'active',case when s.amount_minor=0 then null else now()+interval '30 days' end,s.paid_reference,case when s.amount_minor=0 then 'free' else 'initial_payment' end
  from public.marketplace_plan_selections s where s.application_id=p_application_id and s.service=any(p_services)
  on conflict(organization_id,service) do update set package_id=excluded.package_id,status='active',expires_at=excluded.expires_at,paid_reference=excluded.paid_reference,provider=excluded.provider,updated_at=now();
 end if;
 return v_org;
end;$$;

-- Update sw_service to allow access for free plans without active subscription
create or replace function app.sw_service(p_org uuid,p_service text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_service_access a join public.marketplace_businesses b on b.organization_id=a.organization_id where a.organization_id=p_org and a.service=p_service and (not b.billing_required or exists(select 1 from public.marketplace_subscriptions s where s.organization_id=p_org and s.service=p_service and s.status='active' and (s.expires_at is null or s.expires_at>now()))));
$$;

-- Add function for providers to create custom placements
create function public.marketplace_provider_create_placement(p_org uuid,p_id text,p_name text,p_description text,p_price_daily_minor bigint,p_max_days integer,p_enabled boolean,p_allow_plan_credit boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not app.has_min_role(p_org,'manager') then raise exception 'Manager permission required.' using errcode='42501';end if;
 if not p_id ~ '^[a-z0-9_-]+$' then raise exception 'Placement ID must be lowercase letters, numbers, hyphens, and underscores only.';end if;
 insert into public.marketplace_ad_placements(id,name,description,price_daily_minor,enabled,allow_plan_credit,max_days)
 values(p_org || '_' || p_id,p_name,p_description,p_price_daily_minor,p_enabled,p_allow_plan_credit,p_max_days);
end;$$;

