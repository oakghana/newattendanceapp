alter table public.loan_requests
  add column if not exists basic_salary numeric,
  add column if not exists salary_advance_multiplier integer,
  add column if not exists salary_advance_amount numeric,
  add column if not exists deduction_period_months integer;
