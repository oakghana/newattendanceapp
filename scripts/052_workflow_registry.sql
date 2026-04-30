create extension if not exists pgcrypto;

create table if not exists public.approval_signature_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  workflow_domain text not null check (workflow_domain in ('loan', 'leave', 'attendance')),
  approval_stage text not null,
  signature_mode text not null check (signature_mode in ('typed', 'draw', 'upload')),
  signature_text text,
  signature_data_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_signature_registry_unique unique (user_id, workflow_domain, approval_stage)
);

create index if not exists idx_approval_signature_registry_domain_stage
  on public.approval_signature_registry (workflow_domain, approval_stage);

create table if not exists public.workflow_message_templates (
  id uuid primary key default gen_random_uuid(),
  workflow_domain text not null check (workflow_domain in ('loan', 'leave')),
  template_key text not null,
  title text not null,
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_by uuid references public.user_profiles(id) on delete set null,
  updated_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_message_templates_unique unique (workflow_domain, template_key)
);

create index if not exists idx_workflow_message_templates_domain
  on public.workflow_message_templates (workflow_domain, template_key);

insert into public.workflow_message_templates (workflow_domain, template_key, title, subject, body, is_active)
values
  (
    'loan',
    'loan_approval',
    'Loan Approval Notice',
    'Loan Approval Notice',
    'QUALITY CONTROL COMPANY LIMITED\nHUMAN RESOURCES DEPARTMENT\n\nSUBJECT: LOAN APPROVAL NOTICE\n\nYour loan request has been approved subject to the approved repayment terms.\n\nPlease contact HR and Accounts for the disbursement and recovery schedule.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.',
    true
  ),
  (
    'loan',
    'loan_rejection',
    'Loan Rejection Feedback',
    'Loan Request Feedback',
    'QUALITY CONTROL COMPANY LIMITED\nHUMAN RESOURCES DEPARTMENT\n\nSUBJECT: LOAN REQUEST FEEDBACK\n\nYour loan request has not been approved at this time.\n\nReason: [Insert review reason here]\n\nYou may reapply after resolving the review concerns.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.',
    true
  ),
  (
    'leave',
    'leave_approval',
    'Leave Approval Notice',
    'Leave Approval Notice',
    'QUALITY CONTROL COMPANY LTD.\nHUMAN RESOURCE DIRECTORATE\n\nSUBJECT: LEAVE APPROVAL NOTICE\n\nYour leave request has been reviewed and approved.\n\nKindly proceed based on the approved period and handover guidance from your supervisor.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.',
    true
  ),
  (
    'leave',
    'leave_rejection',
    'Leave Request Feedback',
    'Leave Request Feedback',
    'QUALITY CONTROL COMPANY LTD.\nHUMAN RESOURCE DIRECTORATE\n\nSUBJECT: LEAVE REQUEST FEEDBACK\n\nYour leave request has not been approved at this time.\n\nReason: [Insert review reason here]\n\nYou may reapply with updated dates or documentation where applicable.\n\nRegards,\nHR Administration\nQuality Control Company Ltd.',
    true
  )
on conflict (workflow_domain, template_key) do update
set
  title = excluded.title,
  subject = excluded.subject,
  body = excluded.body,
  is_active = excluded.is_active,
  updated_at = now();