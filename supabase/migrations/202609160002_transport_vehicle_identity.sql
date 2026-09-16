alter table if exists public.transport_vehicles add column if not exists chassis_number text;
alter table if exists public.transport_vehicles add column if not exists vehicle_colour text;

update public.transport_vehicles
set chassis_number = coalesce(nullif(chassis_number, ''), 'NOT-RECORDED-' || left(id::text, 8))
where chassis_number is null or btrim(chassis_number) = '';

create unique index if not exists transport_vehicles_chassis_number_unique
on public.transport_vehicles (upper(chassis_number))
where chassis_number is not null and btrim(chassis_number) <> '';
