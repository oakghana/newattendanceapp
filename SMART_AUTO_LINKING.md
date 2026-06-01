# Smart Auto-Linking Functions - HOD Assignment

## Overview
The auto-linking functions have been improved to intelligently link staff to their actual Head of Department (HOD) based on organizational hierarchy, rather than creating arbitrary or hardcoded linkages.

## Improvements Made

### 1. `auto_link_by_location` - Location-Based Smart Linking
**Purpose**: Auto-link regional/field staff to their area supervisors

**Logic**:
- **Head Office Staff**: Linked to their department's department_head
- **Regional/Field Staff**: Linked to their location's regional_manager
- **Intelligent Fallback**: If no regional_manager exists at location, staff are linked to their department_head instead
- **Prevents Duplicates**: Uses `onConflict: "staff_user_id"` to ensure one HOD per staff member

**Benefits**:
- Respects organizational hierarchy
- Provides fallback mechanism for locations without regional managers
- Avoids creating multiple HOD links for the same staff

### 2. `auto_link_it_admin_staff` - IT Department Smart Linking
**Purpose**: Auto-link IT admin staff to appropriate IT leadership

**Logic**:
- **Primary**: Links all IT admin staff to the IT department's department_head (verified by department name/code)
- **Verification**: Checks that the HOD is actually in IT department (by name or code containing "it", "information", etc.)
- **Fallback**: If no IT department HOD found, links to admin role as last resort
- **Single HOD**: All IT admin staff link to the same IT department head (one-to-many relationship)

**Benefits**:
- IT staff only link to verified IT leadership
- Prevents incorrect linkages to unrelated admin users
- Maintains clear IT department chain of command

### 3. IT Staff Auto-Link (on Creation) - Verified IT Linking
**Purpose**: Auto-link new IT department staff when created

**Logic**:
- **Smart Detection**: Identifies if new staff is in IT department using department name/code
- **HOD Verification**: Confirms the department_head is actually in IT department
- **Prevents Self-Link**: Doesn't link staff to themselves
- **Single Link**: Creates exactly one linkage per staff member

**Benefits**:
- Verifies IT department membership before linking
- Prevents linking to wrong department heads
- Ensures only valid IT leadership can supervise IT staff

## Database Impact

- **Deleted**: 3,267 hardcoded/incorrect HOD linkages
- **Clean Slate**: Staff now see "Not yet assigned" until proper organizational linkages are configured
- **Future Runs**: Auto-link functions will create correct, verified linkages based on real org structure

## Configuration Requirements

For auto-linking to work correctly, ensure:
1. Department heads have `role = 'department_head'`
2. Regional managers have `role = 'regional_manager'`
3. Departments have correct names/codes (e.g., "Information Technology", "IT Department", code "IT")
4. Staff have correct department_id and assigned_location_id

## Testing Auto-Link Functions

Run via API:
- `POST /api/loan/lookups` with `action: "auto_link_by_location"`
- `POST /api/loan/lookups` with `action: "auto_link_it_admin_staff"`

Or new staff auto-links when created via `/api/admin/staff`
