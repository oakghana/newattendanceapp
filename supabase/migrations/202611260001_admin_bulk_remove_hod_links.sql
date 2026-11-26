CREATE OR REPLACE FUNCTION public.admin_remove_hod_links(p_hod_user_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text;
  v_staff_ids uuid[];
  v_link_rows integer := 0;
  v_profile_rows integer := 0;
  v_transport_rows integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'This operation must be invoked by the trusted server.' USING ERRCODE = '42501';
  END IF;

  IF p_hod_user_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'A HOD and Admin actor are required.' USING ERRCODE = '22004';
  END IF;

  SELECT lower(coalesce(up.role, '')) INTO v_actor_role
  FROM public.user_profiles AS up
  WHERE up.id = p_actor_id;

  IF v_actor_role NOT IN ('admin', 'administrator') THEN
    RAISE EXCEPTION 'Only Admin can remove all staff links from a HOD.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT linked.staff_user_id), ARRAY[]::uuid[])
  INTO v_staff_ids
  FROM (
    SELECT l.staff_user_id
    FROM public.loan_hod_linkages AS l
    WHERE l.hod_user_id = p_hod_user_id
    UNION
    SELECT up.id AS staff_user_id
    FROM public.user_profiles AS up
    WHERE up.hod_id = p_hod_user_id
  ) AS linked;

  DELETE FROM public.loan_hod_linkages
  WHERE hod_user_id = p_hod_user_id;
  GET DIAGNOSTICS v_link_rows = ROW_COUNT;

  UPDATE public.user_profiles
  SET hod_id = NULL, updated_at = now()
  WHERE hod_id = p_hod_user_id;
  GET DIAGNOSTICS v_profile_rows = ROW_COUNT;

  UPDATE public.nonregional_transport_requisitions
  SET hod_id = NULL, updated_at = now()
  WHERE hod_id = p_hod_user_id;
  GET DIAGNOSTICS v_transport_rows = ROW_COUNT;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, new_values, details
  ) VALUES (
    p_actor_id,
    'ADMIN_BULK_REMOVE_HOD_LINKS',
    'loan_hod_linkages',
    p_hod_user_id,
    jsonb_build_object('hod_user_id', p_hod_user_id, 'staff_user_ids', to_jsonb(v_staff_ids), 'link_rows_removed', v_link_rows),
    jsonb_build_object('hod_user_id', p_hod_user_id, 'linked_staff_count', 0),
    jsonb_build_object(
      'linked_staff_count', cardinality(v_staff_ids),
      'link_rows_removed', v_link_rows,
      'legacy_profile_links_removed', v_profile_rows,
      'nonregional_transport_links_cleared', v_transport_rows
    )
  );

  RETURN jsonb_build_object(
    'hod_user_id', p_hod_user_id,
    'affected_staff_count', cardinality(v_staff_ids),
    'link_rows_removed', v_link_rows,
    'legacy_profile_links_removed', v_profile_rows,
    'nonregional_transport_links_cleared', v_transport_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_hod_links(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_hod_links(uuid, uuid) TO service_role;
