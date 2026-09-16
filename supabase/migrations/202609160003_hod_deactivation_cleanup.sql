create or replace function public.clear_deactivated_hod_links()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.is_active is distinct from false and new.is_active = false
     and new.role in ('department_head', 'regional_manager') then
    delete from public.loan_hod_linkages where hod_user_id = new.id;
    update public.user_profiles
      set hod_id = null, updated_at = now()
      where hod_id = new.id;
    update public.nonregional_transport_requisitions
      set hod_id = null, updated_at = now()
      where hod_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_deactivated_hod_links on public.user_profiles;
create trigger clear_deactivated_hod_links
after update of is_active, role on public.user_profiles
for each row execute function public.clear_deactivated_hod_links();

-- Remove existing invalid assignments without deleting historical requests.
delete from public.loan_hod_linkages l
using public.user_profiles p
where p.id = l.hod_user_id
  and p.is_active = false
  and p.role in ('department_head', 'regional_manager');

update public.user_profiles
set hod_id = null, updated_at = now()
where hod_id in (
  select id from public.user_profiles
  where is_active = false and role in ('department_head', 'regional_manager')
);

update public.nonregional_transport_requisitions
set hod_id = null, updated_at = now()
where hod_id in (
  select id from public.user_profiles
  where is_active = false and role in ('department_head', 'regional_manager')
);

create index if not exists user_profiles_hod_id_idx on public.user_profiles(hod_id);
