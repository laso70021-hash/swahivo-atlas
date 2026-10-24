-- Explicit acceptance and complete booking details are mandatory, including for direct API callers.
create or replace function public.marketplace_request_booking(p_offer_id uuid,p_from timestamptz,p_to timestamptz,p_pickup text,p_return text,p_driver_name text,p_accept_terms boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.marketplace_offers;u uuid:=(select auth.uid());v_id uuid;v_days integer;begin
 if u is null then raise exception 'Sign in to request a booking.' using errcode='42501';end if;
 if p_accept_terms is not true or char_length(btrim(coalesce(p_driver_name,'')))<2 or char_length(btrim(coalesce(p_pickup,'')))<2 or char_length(btrim(coalesce(p_return,'')))<2 then raise exception 'Complete driver, pickup, return and terms details.';end if;
 if p_from is null or p_to is null or p_from<now()-interval '5 minutes' or p_to<=p_from or p_to-p_from>interval '366 days' then raise exception 'Choose a valid future rental period.';end if;
 if (select count(*) from public.marketplace_reservations where customer_id=u and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before making more booking requests.';end if;
 select * into o from public.marketplace_offers where id=p_offer_id and service='rental' and status='published' for update;
 if not found or not app.sw_service(o.organization_id,'rental') then raise exception 'Rental listing unavailable.';end if;
 if not exists(select 1 from public.marketplace_available_offers(p_from,p_to) available where available=o.id) then raise exception 'This vehicle is not available for those dates.' using errcode='23P01';end if;
 v_days:=greatest(1,ceil(extract(epoch from p_to-p_from)/86400)::integer);
 insert into public.marketplace_reservations(organization_id,offer_id,customer_id,starts_at,ends_at,pickup_location,return_location,driver_name,daily_rate_minor,total_minor,deposit_minor,currency) values(o.organization_id,o.id,u,p_from,p_to,left(p_pickup,160),left(p_return,160),left(p_driver_name,160),o.price_minor,v_days*o.price_minor,o.deposit_minor,o.currency) returning id into v_id;
 return v_id;
end;$$;
