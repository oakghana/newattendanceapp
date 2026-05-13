-- Migration: Update leave_plan_reviews constraint to allow admin and hr roles for reviews
-- Date: 2026-05-13
-- Purpose: Allow admin, leave_admin, and hr_leave_office roles to submit HOD reviews

BEGIN;

-- Drop and recreate the constraint on leave_plan_reviews
ALTER TABLE public.leave_plan_reviews DROP CONSTRAINT IF EXISTS "leave_plan_reviews_reviewer_role_check";

ALTER TABLE public.leave_plan_reviews
  ADD CONSTRAINT leave_plan_reviews_reviewer_role_check CHECK (
    reviewer_role IN (
      'regional_manager',
      'department_head',
      'admin',
      'leave_admin',
      'hr_office',
      'hr_leave_office'
    )
  );

-- Drop and recreate the constraint on leave_plan_stagger_reviews
ALTER TABLE public.leave_plan_stagger_reviews DROP CONSTRAINT IF EXISTS "leave_plan_stagger_reviews_reviewer_role_check";

ALTER TABLE public.leave_plan_stagger_reviews
  ADD CONSTRAINT leave_plan_stagger_reviews_reviewer_role_check CHECK (
    reviewer_role IN (
      'regional_manager',
      'department_head',
      'admin',
      'leave_admin',
      'hr_office',
      'hr_leave_office'
    )
  );

COMMIT;
