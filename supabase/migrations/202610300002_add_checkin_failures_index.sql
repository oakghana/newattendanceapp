CREATE INDEX IF NOT EXISTS audit_logs_failure_actions_created_at_idx
  ON public.audit_logs (created_at DESC, id DESC)
  WHERE action IN (
    'check_in_failed',
    'offpremises_checkin_failed',
    'check_out_failed',
    'offpremises_checkout_failed',
    'qr_check_out_failed',
    'auto_checkout_failed',
    'force_checkout_after_failed_attempts'
  );
