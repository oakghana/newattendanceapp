-- ============================================================================
-- Script: Remove Inactive HODs from Linkages
-- ============================================================================
-- This script removes loan_hod_linkages where either:
-- 1. The staff member (staff_user_id) is marked as is_active=false, OR
-- 2. The HOD (hod_user_id) is marked as is_active=false
--
-- Usage:
-- 1. Copy all queries below
-- 2. Open Supabase Dashboard → SQL Editor
-- 3. Paste and run each query in order
-- 4. Run STEP 1 first to see what will be removed
-- ============================================================================

-- ============================================================================
-- STEP 1: AUDIT - View all invalid linkages (SAFE - no changes)
-- ============================================================================
-- This shows all linkages that will be removed
-- Run this first to verify what will be deleted

SELECT 
  l.id as linkage_id,
  l.staff_user_id,
  sp.email as staff_email,
  sp.first_name as staff_name,
  sp.is_active as staff_active,
  l.hod_user_id,
  hp.email as hod_email,
  hp.first_name as hod_name,
  hp.is_active as hod_active,
  l.created_at,
  CASE 
    WHEN sp.is_active = false AND hp.is_active = false THEN 'Both inactive'
    WHEN sp.is_active = false THEN 'Staff inactive'
    WHEN hp.is_active = false THEN 'HOD inactive'
    ELSE 'Unknown'
  END as reason
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false
ORDER BY l.created_at DESC;

-- ============================================================================
-- STEP 2: COUNT - See statistics before deletion
-- ============================================================================
-- Shows summary statistics

SELECT 
  COUNT(*) as total_invalid_linkages,
  SUM(CASE WHEN sp.is_active = false AND hp.is_active = false THEN 1 ELSE 0 END) as both_inactive,
  SUM(CASE WHEN sp.is_active = false AND hp.is_active = true THEN 1 ELSE 0 END) as staff_inactive_only,
  SUM(CASE WHEN sp.is_active = true AND hp.is_active = false THEN 1 ELSE 0 END) as hod_inactive_only
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;

-- ============================================================================
-- STEP 3: GET IDs - Get all IDs to be deleted
-- ============================================================================
-- This gets the IDs of linkages to be deleted

SELECT id
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;

-- ============================================================================
-- STEP 4: DELETE - Remove invalid linkages
-- ============================================================================
-- WARNING: This PERMANENTLY DELETES records
-- Make sure you've reviewed STEP 1 and STEP 2 before running this!
--
-- Uncomment the DELETE statement below and run to remove linkages:

-- DELETE FROM loan_hod_linkages
-- WHERE id IN (
--   SELECT l.id
--   FROM loan_hod_linkages l
--   LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
--   LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
--   WHERE sp.is_active = false OR hp.is_active = false
-- );

-- ============================================================================
-- STEP 5: VERIFY - Confirm deletion (run after STEP 4)
-- ============================================================================
-- Run this after deletion to confirm all invalid linkages are gone

SELECT COUNT(*) as remaining_invalid_linkages
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;

-- Expected result: 0 remaining invalid linkages

-- ============================================================================
-- STEP 6: SUMMARY - Get overall statistics
-- ============================================================================
-- Shows total valid linkages after cleanup

SELECT 
  COUNT(*) as total_valid_linkages,
  COUNT(DISTINCT l.staff_user_id) as unique_staff,
  COUNT(DISTINCT l.hod_user_id) as unique_hods
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = true AND hp.is_active = true;

-- ============================================================================
-- OPTIONAL: Find staff with no valid HOD linkages after cleanup
-- ============================================================================
-- This identifies staff who had linkages removed and now have no HOD

SELECT 
  up.id,
  up.email,
  up.first_name,
  up.last_name,
  up.department_id,
  COUNT(l.id) as active_hod_linkages
FROM user_profiles up
LEFT JOIN loan_hod_linkages l ON up.id = l.staff_user_id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id AND hp.is_active = true
WHERE up.is_active = true
  AND up.role NOT IN ('hr_executive', 'accounts_executive', 'regional_manager', 'departmental_head', 'admin')
GROUP BY up.id, up.email, up.first_name, up.last_name, up.department_id
HAVING COUNT(l.id) = 0
ORDER BY up.created_at DESC;

-- ============================================================================
-- OPTIONAL: Re-link unlinked staff to available HODs
-- ============================================================================
-- After cleanup, you may want to re-link staff to available active HODs
-- See auto-link-hods endpoint or run: npm run auto-link:hods
