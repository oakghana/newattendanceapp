/**
 * Centralized role mapping utilities
 * Handles the mapping between UI display roles and database storage roles
 */

// API role mapping: converts UI roles to database storage format
export const API_ROLE_MAPPINGS: Record<string, string> = {
  'accounts_executive': 'accounts',
  'hr_executive': 'hr_leave_office'
};

// Reverse mapping: converts database roles back to UI display format
const REVERSE_ROLE_MAPPINGS: Record<string, string> = {
  'accounts': 'accounts_executive',
  'hr_office': 'hr_leave_office',
  'hr_leave_office': 'hr_leave_office',
};

/**
 * Maps database role to display role
 * Used to show the correct role name in UI components
 */
export function displayRole(dbRole: string | null | undefined): string {
  const normalized = String(dbRole || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (["regional_hr_leave_office", "regional_leave_office"].includes(normalized)) return "regional_hr";
  if (normalized === "administrator") return "admin";
  return REVERSE_ROLE_MAPPINGS[normalized] || normalized;
}

/**
 * Formats role for display (uppercase with spaces)
 */
export function formatRoleForDisplay(dbRole: string | null | undefined): string {
  const mapped = displayRole(dbRole);
  return mapped.replace(/_/g, ' ').toUpperCase();
}

/**
 * Maps UI role selection to database storage format
 * Used by API endpoints when saving role changes
 */
export function mapRoleForDatabase(uiRole: string | null | undefined): string {
  const normalized = String(uiRole || '').toLowerCase().trim();
  return API_ROLE_MAPPINGS[normalized] || normalized;
}
