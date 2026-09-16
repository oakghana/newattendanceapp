alter table if exists public.transport_requests
  add column if not exists regional_route text;

update public.transport_requests
set regional_route = 'local_regional'
where request_type = 'regional_transport' and regional_route is null;

alter table if exists public.transport_requests
  drop constraint if exists transport_requests_regional_route_check;

alter table if exists public.transport_requests
  add constraint transport_requests_regional_route_check
  check (regional_route is null or regional_route in ('local_regional', 'head_office'));

create index if not exists transport_requests_regional_route_idx
  on public.transport_requests (regional_route, workflow_stage);

comment on column public.transport_requests.regional_route is
  'Regional HR route: local_regional goes to the Regional Chief Driver after approval; head_office goes through MD approval and HR Executive memo signing.';
