BEGIN;

DO $$
DECLARE
  v_removed_links jsonb;
  v_legacy_profile_links jsonb;
  v_link_count integer := 0;
  v_profile_count integer := 0;
BEGIN
  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id', l.id,
      'staff_user_id', l.staff_user_id,
      'hod_user_id', l.hod_user_id,
      'location_id', l.location_id,
      'created_by', l.created_by,
      'created_at', l.created_at,
      'updated_at', l.updated_at
    )),
    '[]'::jsonb
  ) INTO v_removed_links
  FROM public.loan_hod_linkages AS l
  JOIN public.user_profiles AS staff ON staff.id = l.staff_user_id
  WHERE lower(trim(coalesce(staff.role, ''))) IN ('nsp', 'intern');

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('staff_user_id', up.id, 'hod_user_id', up.hod_id)),
    '[]'::jsonb
  ) INTO v_legacy_profile_links
  FROM public.user_profiles AS up
  WHERE lower(trim(coalesce(up.role, ''))) IN ('nsp', 'intern')
    AND up.hod_id IS NOT NULL;

  DELETE FROM public.loan_hod_linkages AS l
  USING public.user_profiles AS staff
  WHERE staff.id = l.staff_user_id
    AND lower(trim(coalesce(staff.role, ''))) IN ('nsp', 'intern');
  GET DIAGNOSTICS v_link_count = ROW_COUNT;

  UPDATE public.user_profiles AS up
  SET hod_id = NULL, updated_at = now()
  WHERE lower(trim(coalesce(up.role, ''))) IN ('nsp', 'intern')
    AND up.hod_id IS NOT NULL;
  GET DIAGNOSTICS v_profile_count = ROW_COUNT;

  IF v_link_count > 0 OR v_profile_count > 0 THEN
    INSERT INTO public.audit_logs (
      action,
      table_name,
      old_values,
      new_values,
      details
    ) VALUES (
      'HOD_LINKAGES_CLEARED_FOR_ROLE_EXEMPTION',
      'loan_hod_linkages',
      jsonb_build_object(
        'loan_hod_linkages', v_removed_links,
        'legacy_user_profile_hod_links', v_legacy_profile_links
      ),
      jsonb_build_object('roles_exempt_from_hod', jsonb_build_array('nsp', 'intern')),
      jsonb_build_object(
        'reason', 'NSP and Intern roles are exempt from HOD and Leave HOD linkages.',
        'link_rows_removed', v_link_count,
        'legacy_profile_links_cleared', v_profile_count,
        'pending_hod_stage_leave_requests', 0,
        'pending_hod_stage_loan_requests', 0
      )
    );
  END IF;
END;
$$;

COMMIT;
