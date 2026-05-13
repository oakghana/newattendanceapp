-- Migration: Update Leave Type Labels
-- Date: 2025-05-13
-- Description: Separate Special from Leave Without Pay, update unpaid leave label to "Leave Without Pay"

-- Update the leave_type_labels in leave_policy_catalog table
UPDATE leave_policy_catalog
SET leave_type_label = 'Leave Without Pay'
WHERE leave_type_key = 'unpaid'
AND leave_type_label IN ('Unpaid Leave', 'unpaid_leave');

-- Ensure Special Leave is correctly labeled
UPDATE leave_policy_catalog
SET leave_type_label = 'Special Leave'
WHERE leave_type_key = 'special'
AND leave_type_label NOT IN ('Special Leave');

-- Verify the changes
SELECT leave_type_key, leave_type_label, entitlement_days, is_enabled
FROM leave_policy_catalog
WHERE leave_type_key IN ('unpaid', 'special')
ORDER BY leave_type_key;
