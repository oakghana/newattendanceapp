-- ============================================================================
-- Admin Menu Access Fix - SQL Queries
-- ============================================================================
-- These queries will grant admin users access to:
-- • Memo Console
-- • Disbursement Confirmation
--
-- Run these queries one at a time in Supabase SQL Editor:
-- 1. Go to https://app.supabase.com/
-- 2. Select your project
-- 3. Navigate to SQL Editor
-- 4. Create a new query
-- 5. Copy and paste each query below and click "Run"
-- ============================================================================

-- ============================================================================
-- QUERY 1: View all users with admin-related roles
-- Run this FIRST to see what admin roles exist in the database
-- ============================================================================
-- Look for any roles that contain "admin" (case-insensitive)
-- Examples you might see: "admin", "Admin", "ADMIN", "AdminUser", "it-admin"
SELECT 
  id,
  email,
  role,
  created_at,
  CASE 
    WHEN LOWER(TRIM(role)) = 'admin' THEN 'ℹ️ Ready'
    ELSE '⚠️ Needs Fix'
  END as status
FROM user_profiles
WHERE LOWER(TRIM(role)) = 'admin'
   OR LOWER(TRIM(role)) LIKE '%admin%'
ORDER BY role, email;

-- ============================================================================
-- QUERY 2: Normalize all admin roles to lowercase "admin"
-- Run this SECOND to fix any non-standard admin roles
-- ============================================================================
-- This will update all admin-related roles to exactly "admin" (lowercase)
UPDATE user_profiles
SET role = 'admin'
WHERE LOWER(TRIM(role)) LIKE '%admin%'
  AND LOWER(TRIM(role)) != 'admin';

-- ============================================================================
-- QUERY 3: Verify admin users after the fix
-- Run this THIRD to confirm the fix worked
-- ============================================================================
-- Shows all users with role = 'admin' after normalization
SELECT 
  id,
  email,
  role,
  first_name,
  last_name,
  created_at
FROM user_profiles
WHERE role = 'admin'
ORDER BY email;

-- ============================================================================
-- QUERY 4 (Optional): Check if any other normalization is needed
-- Run this to see all roles in the system and their counts
-- ============================================================================
SELECT 
  role,
  COUNT(*) as count,
  STRING_AGG(DISTINCT email, ', ' ORDER BY email) as users
FROM user_profiles
GROUP BY role
ORDER BY count DESC;

-- ============================================================================
-- NOTES
-- ============================================================================
-- The sidebar menu configuration expects admin roles to be exactly:
--   • "admin" (lowercase, no spaces, no special characters)
--
-- Menu Access:
--   • Memo Console: roles: ["secretary", "admin"]
--   • Disbursement Confirmation: roles: ["admin", "accounts_executive"]
--
-- The sidebar normalizes roles with: normalizedRole = (profile?.role || "staff").toLowerCase().trim()
-- So "Admin", "ADMIN", "admin " all become "admin" for comparison
--
-- If roles are still not matching after normalization:
-- 1. Check if there are any trailing spaces
-- 2. Check if there are any special characters
-- 3. Use QUERY 1 to see exact role values in database
-- ============================================================================
