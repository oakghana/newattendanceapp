-- Loan inactivity governance hardening
-- Safe to re-run

alter table if exists public.loan_requests
  add column if not exists hod_auto_advanced_at timestamptz,
  add column if not exists hod_auto_advanced_reason text,
  add column if not exists governance_updated_at timestamptz default now();

create index if not exists idx_loan_requests_pending_hod_submitted
  on public.loan_requests (status, submitted_at);

create index if not exists idx_loan_requests_status_updated
  on public.loan_requests (status, updated_at);

create index if not exists idx_loan_timeline_action_created
  on public.loan_request_timeline (action_key, created_at desc);

create index if not exists idx_loan_timeline_request_action
  on public.loan_request_timeline (loan_request_id, action_key, created_at desc);
