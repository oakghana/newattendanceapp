-- Motor bike loans must be reviewed by the Loan Committee after HOD endorsement.
UPDATE public.loan_types
SET requires_committee = true,
    updated_at = now()
WHERE lower(coalesce(loan_key, '')) LIKE '%motor%'
   OR lower(coalesce(loan_label, '')) LIKE '%motor%';

-- Keep the rule explicit for any existing imported motor bike requests that
-- have already passed HOD but have not yet reached the Committee queue.
UPDATE public.loan_requests
SET status = 'awaiting_committee',
    committee_required = true,
    repayment_status = NULL,
    md_approved_at = NULL,
    updated_at = now()
WHERE is_imported = true
  AND lower(concat_ws(' ', loan_type_key, loan_type_label)) LIKE '%motor%'
  AND status <> 'awaiting_committee';

NOTIFY pgrst, 'reload schema';
