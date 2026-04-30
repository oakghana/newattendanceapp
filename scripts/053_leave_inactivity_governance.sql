alter table if exists public.leave_requests
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.user_profiles(id) on delete set null,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.leave_notifications
  add column if not exists status text default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_leave_requests_status_created_at
  on public.leave_requests (status, created_at);

create index if not exists idx_leave_notifications_status_created_at
  on public.leave_notifications (status, created_at);

create index if not exists idx_leave_notifications_request_status
  on public.leave_notifications (leave_request_id, status);