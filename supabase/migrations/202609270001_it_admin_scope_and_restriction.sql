alter table public.user_profiles
  add column if not exists it_admin_update_restricted boolean not null default false,
  add column if not exists it_admin_scope text;

alter table public.user_profiles
  drop constraint if exists user_profiles_it_admin_scope_check;

alter table public.user_profiles
  add constraint user_profiles_it_admin_scope_check
  check (it_admin_scope is null or it_admin_scope in ('regional_it_admin', 'head_office_it_admin'));

create index if not exists user_profiles_it_admin_scope_idx
  on public.user_profiles (it_admin_scope)
  where it_admin_scope is not null;

comment on column public.user_profiles.it_admin_update_restricted is
  'When true, IT Admins cannot update this profile; Administrators retain access.';
comment on column public.user_profiles.it_admin_scope is
  'Explicit IT Admin scope: regional_it_admin or head_office_it_admin.';

-- Existing rows are intentionally unchanged: the restriction remains false and
-- existing IT Admins must be assigned an explicit scope by an Administrator.

create or replace function public.audit_it_admin_staff_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.it_admin_update_restricted is distinct from old.it_admin_update_restricted
     or new.it_admin_scope is distinct from old.it_admin_scope then
    insert into public.audit_logs (user_id, action, table_name, record_id, old_values, new_values, details)
    values (
      auth.uid(),
      'update_it_admin_controls',
      'user_profiles',
      new.id,
      jsonb_build_object('it_admin_update_restricted', old.it_admin_update_restricted, 'it_admin_scope', old.it_admin_scope),
      jsonb_build_object('it_admin_update_restricted', new.it_admin_update_restricted, 'it_admin_scope', new.it_admin_scope),
      jsonb_build_object('source', 'database_trigger')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_it_admin_controls_audit on public.user_profiles;
create trigger user_profiles_it_admin_controls_audit
after update on public.user_profiles
for each row execute function public.audit_it_admin_staff_change();

revoke all on function public.audit_it_admin_staff_change() from public;
grant execute on function public.audit_it_admin_staff_change() to authenticated;
