-- ============================================================================
-- TARGETED CLEANUP: Remove 20 Invalid HOD Linkages
-- ============================================================================
-- These linkages have been identified and verified as invalid:
-- - 1 linkage: Staff inactive (Nelson.debrah@qccgh.com)
-- - 19 linkages: HOD inactive (samuel.oteng@qccgh.com)
-- ============================================================================

-- STEP 1: View the linkages to be removed (SAFE - Read only)
SELECT 
  id, 
  staff_email, 
  staff_active, 
  hod_email, 
  hod_active, 
  reason
FROM (
  SELECT 
    l.id, 
    sp.email as staff_email, 
    sp.is_active as staff_active,
    hp.email as hod_email, 
    hp.is_active as hod_active,
    CASE 
      WHEN sp.is_active = false AND hp.is_active = false THEN 'Both inactive'
      WHEN sp.is_active = false THEN 'Staff inactive'
      WHEN hp.is_active = false THEN 'HOD inactive'
    END as reason
  FROM loan_hod_linkages l
  LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
  LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
  WHERE l.id IN (
    '511962ef-1ecd-4ecd-b1e3-b86118aa7eae',
    '75968750-63cb-45b2-8b46-a141df3efe2f',
    'cf505aaf-0b2b-4c6a-8546-50fdabab47b4',
    '39c1a455-c448-4132-9271-c3ffc8289552',
    '4e457f98-50ec-4e96-9df7-e8a427592385',
    '9a4707c8-4536-45e2-8f1d-bd420efa4dfc',
    '3ad70252-49d5-4a6b-b4cf-3181cda05e67',
    '3390ba1d-2e71-4ed6-b9f6-9b80a3cae6b4',
    '538dd987-750c-4015-874b-c0d6306e798e',
    '9bf54e8d-b875-4f9a-abb8-87d55c1a012e',
    '89b56353-a899-4408-8986-38eecee8c35a',
    '0e2c754f-e521-4ef2-bdee-c8d07bbfc223',
    'f6aad379-588b-43f1-ae51-fb5046a6dc91',
    '32ca7728-dddb-4c22-9704-93a30f5a470e',
    'c5958cdf-cec6-43e6-bc8d-5994c0366350',
    'cecd47a2-1d6e-460b-b13c-6304ba04ca7c',
    'b70d6abf-67a2-43d6-b91c-566c2577bc46',
    '25c38940-7ff9-429b-915d-b048e61f8117',
    'a7925315-9863-49d6-bbcd-7950f050d48a',
    '6127bbd0-8fe5-4815-bf70-3a53459dd159'
  )
) as invalid_linkages
ORDER BY hod_email, staff_email;

-- STEP 2: Count before deletion
SELECT COUNT(*) as invalid_linkages_count
FROM loan_hod_linkages
WHERE id IN (
  '511962ef-1ecd-4ecd-b1e3-b86118aa7eae',
  '75968750-63cb-45b2-8b46-a141df3efe2f',
  'cf505aaf-0b2b-4c6a-8546-50fdabab47b4',
  '39c1a455-c448-4132-9271-c3ffc8289552',
  '4e457f98-50ec-4e96-9df7-e8a427592385',
  '9a4707c8-4536-45e2-8f1d-bd420efa4dfc',
  '3ad70252-49d5-4a6b-b4cf-3181cda05e67',
  '3390ba1d-2e71-4ed6-b9f6-9b80a3cae6b4',
  '538dd987-750c-4015-874b-c0d6306e798e',
  '9bf54e8d-b875-4f9a-abb8-87d55c1a012e',
  '89b56353-a899-4408-8986-38eecee8c35a',
  '0e2c754f-e521-4ef2-bdee-c8d07bbfc223',
  'f6aad379-588b-43f1-ae51-fb5046a6dc91',
  '32ca7728-dddb-4c22-9704-93a30f5a470e',
  'c5958cdf-cec6-43e6-bc8d-5994c0366350',
  'cecd47a2-1d6e-460b-b13c-6304ba04ca7c',
  'b70d6abf-67a2-43d6-b91c-566c2577bc46',
  '25c38940-7ff9-429b-915d-b048e61f8117',
  'a7925315-9863-49d6-bbcd-7950f050d48a',
  '6127bbd0-8fe5-4815-bf70-3a53459dd159'
);
-- Expected result: 20

-- ============================================================================
-- STEP 3: DELETE THE 20 INVALID LINKAGES
-- ============================================================================
-- UNCOMMENT AND RUN THE DELETE STATEMENT BELOW:

DELETE FROM loan_hod_linkages
WHERE id IN (
  '511962ef-1ecd-4ecd-b1e3-b86118aa7eae',
  '75968750-63cb-45b2-8b46-a141df3efe2f',
  'cf505aaf-0b2b-4c6a-8546-50fdabab47b4',
  '39c1a455-c448-4132-9271-c3ffc8289552',
  '4e457f98-50ec-4e96-9df7-e8a427592385',
  '9a4707c8-4536-45e2-8f1d-bd420efa4dfc',
  '3ad70252-49d5-4a6b-b4cf-3181cda05e67',
  '3390ba1d-2e71-4ed6-b9f6-9b80a3cae6b4',
  '538dd987-750c-4015-874b-c0d6306e798e',
  '9bf54e8d-b875-4f9a-abb8-87d55c1a012e',
  '89b56353-a899-4408-8986-38eecee8c35a',
  '0e2c754f-e521-4ef2-bdee-c8d07bbfc223',
  'f6aad379-588b-43f1-ae51-fb5046a6dc91',
  '32ca7728-dddb-4c22-9704-93a30f5a470e',
  'c5958cdf-cec6-43e6-bc8d-5994c0366350',
  'cecd47a2-1d6e-460b-b13c-6304ba04ca7c',
  'b70d6abf-67a2-43d6-b91c-566c2577bc46',
  '25c38940-7ff9-429b-915d-b048e61f8117',
  'a7925315-9863-49d6-bbcd-7950f050d48a',
  '6127bbd0-8fe5-4815-bf70-3a53459dd159'
);
-- Result: 20 rows deleted

-- ============================================================================
-- STEP 4: VERIFY DELETION
-- ============================================================================
-- Check that all 20 linkages are gone
SELECT COUNT(*) as remaining_invalid
FROM loan_hod_linkages
WHERE id IN (
  '511962ef-1ecd-4ecd-b1e3-b86118aa7eae',
  '75968750-63cb-45b2-8b46-a141df3efe2f',
  'cf505aaf-0b2b-4c6a-8546-50fdabab47b4',
  '39c1a455-c448-4132-9271-c3ffc8289552',
  '4e457f98-50ec-4e96-9df7-e8a427592385',
  '9a4707c8-4536-45e2-8f1d-bd420efa4dfc',
  '3ad70252-49d5-4a6b-b4cf-3181cda05e67',
  '3390ba1d-2e71-4ed6-b9f6-9b80a3cae6b4',
  '538dd987-750c-4015-874b-c0d6306e798e',
  '9bf54e8d-b875-4f9a-abb8-87d55c1a012e',
  '89b56353-a899-4408-8986-38eecee8c35a',
  '0e2c754f-e521-4ef2-bdee-c8d07bbfc223',
  'f6aad379-588b-43f1-ae51-fb5046a6dc91',
  '32ca7728-dddb-4c22-9704-93a30f5a470e',
  'c5958cdf-cec6-43e6-bc8d-5994c0366350',
  'cecd47a2-1d6e-460b-b13c-6304ba04ca7c',
  'b70d6abf-67a2-43d6-b91c-566c2577bc46',
  '25c38940-7ff9-429b-915d-b048e61f8117',
  'a7925315-9863-49d6-bbcd-7950f050d48a',
  '6127bbd0-8fe5-4815-bf70-3a53459dd159'
);
-- Expected result: 0 (all deleted)

-- ============================================================================
-- STEP 5: FINAL SUMMARY
-- ============================================================================
SELECT 
  'Total valid linkages remaining' as metric,
  COUNT(*) as count
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = true AND hp.is_active = true;
