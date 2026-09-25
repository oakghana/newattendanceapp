update public.loan_types
set fixed_amount = 0,
    max_amount = 0,
    updated_at = now()
where lower(loan_key) = 'salary_advance';

update public.loan_requests
set fixed_amount = null,
    requested_amount = null,
  fd_score = null,
  fd_good = null,
  fd_checked_at = null,
    updated_at = now()
where lower(loan_type_key) = 'salary_advance'
  and salary_advance_amount is null
  and status in ('pending_hod', 'hod_approved', 'sent_to_accounts');