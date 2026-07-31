-- ============================================================================
-- CLEANUP SCRIPT: Remove HOD linkages where HOD has "staff" role
-- ============================================================================
-- Purpose: Staff role users should NOT be linked as HODs
-- Only these roles can be HODs:
--   - hr_executive
--   - accounts_executive
--   - regional_manager
--   - departmental_head
-- ============================================================================

-- STEP 1: View linkages with staff role HODs (PREVIEW)
SELECT 
  l.id,
  sp.email as staff_email,
  sp.id as staff_id,
  hp.email as hod_email,
  hp.id as hod_id,
  hp.role as hod_role,
  'INVALID: HOD has staff role' as reason,
  l.created_at
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff'
ORDER BY l.created_at DESC;

-- ============================================================================

-- STEP 2: Count invalid linkages
SELECT 
  COUNT(*) as total_invalid_staff_role_hods
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff';

-- ============================================================================

-- STEP 3: Get unique staff role HODs who are incorrectly assigned
SELECT DISTINCT
  hp.id as hod_id,
  hp.email as hod_email,
  hp.first_name,
  hp.last_name,
  hp.role,
  hp.department_id,
  hp.assigned_location_id,
  COUNT(l.id) as linkage_count
FROM loan_hod_linkages l
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff'
GROUP BY hp.id, hp.email, hp.first_name, hp.last_name, hp.role, hp.department_id, hp.assigned_location_id
ORDER BY linkage_count DESC;

-- ============================================================================

-- STEP 4: Extract IDs to remove (safe extraction)
SELECT id FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff';

-- ============================================================================

-- STEP 5: DELETE invalid linkages (UNCOMMENT AND RUN ONLY AFTER VERIFICATION)
-- DELETE FROM loan_hod_linkages
-- WHERE id IN (
--   SELECT l.id FROM loan_hod_linkages l
--   LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
--   LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
--   WHERE hp.role = 'staff'
-- );

-- ============================================================================

-- STEP 6: Verify deletion (should return 0)
-- SELECT COUNT(*) as remaining_invalid
-- FROM loan_hod_linkages l
-- LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
-- LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
-- WHERE hp.role = 'staff';

-- ============================================================================

-- STEP 7: Re-link staff to proper HODs in their department/location
-- After removing staff role HODs, re-run auto-link:
-- npm run auto-link:hods

-- ============================================================================
