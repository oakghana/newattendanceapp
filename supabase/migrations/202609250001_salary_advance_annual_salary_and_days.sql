alter table public.loan_requests
  add column if not exists annual_salary numeric,
  add column if not exists salary_advance_days integer;

comment on column public.loan_requests.annual_salary is
  'Verified annual salary used to calculate salary advances as annual salary / 12 * requested months.';

comment on column public.loan_requests.salary_advance_days is
  'Number of days entered by HR Loan Office on the salary advice before HR Executive review.';