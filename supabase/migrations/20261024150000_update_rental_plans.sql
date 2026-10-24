-- Update rental service packages with specified pricing tiers
set search_path = public, extensions, pg_temp;

-- Remove the existing placeholder rental package
delete from public.service_packages where service='rental' and name='Rental';

-- Insert the new rental packages with specified pricing
insert into public.service_packages(service,name,monthly_tzs,listing_limit,published,features,included_ad_days) values
('rental','Starter',49000,10,true,array['10 active rental listings','Customer enquiries','Booking management','Rental operations'],5),
('rental','Growth',99000,30,true,array['30 active rental listings','Customer enquiries','Booking management','Rental operations'],10),
('rental','Professional',199000,50,true,array['50 active rental listings','Customer enquiries','Booking management','Rental operations'],15),
('rental','Business',299000,100,true,array['100 active rental listings','Customer enquiries','Booking management','Rental operations'],20),
('rental','Enterprise',399000,200,true,array['200 active rental listings','Customer enquiries','Booking management','Rental operations'],30);
