create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.user_profiles(id) on delete cascade,
  request_id uuid,
  notification_type text not null,
  created_at timestamptz not null default now(),
  unique (recipient_id, request_id, notification_type)
);

alter table public.push_delivery_log enable row level security;
revoke all on public.push_delivery_log from anon, authenticated;

alter table public.staff_notifications add column if not exists action_url text;
alter table public.staff_notifications add column if not exists data jsonb;
