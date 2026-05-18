# Check-In Conditions & Validation Rules

## CRITICAL FIX APPLIED ✅
**Issue:** Auto check-in was allowing staff to check in even when OUT OF RANGE
**Root Cause:** Fast check-in API was missing geofence validation
**Status:** FIXED - Geofence validation now enforced on all auto check-in attempts

---

## All Check-In Conditions Implemented

### 1. **Duplicate Check-In (Both Standard & Fast) ✅**
- **What:** Prevents a user from checking in twice on the same day
- **Implementation:** Queries `attendance_records` table for same-day records
- **Error:** "You have already checked in today at [TIME]. You are currently on duty."
- **Applies to:** Both Standard and Fast check-in

### 2. **Leave Status (Both Standard & Fast) ✅ [NEWLY ADDED TO FAST]**
- **What:** Blocks check-in if user has approved leave for the day
- **Implementation:** Checks `leave_status` table for status="on_leave"
- **Error:** "You are on approved leave today. Cannot check in while on leave."
- **Applies to:** Both Standard and Fast check-in
- **Override:** Emergency staff (Security, Operational, Transport) can override with reason

### 3. **Geofence / Location Range (Both Standard & Fast) ✅ [NEWLY ADDED TO FAST]**
- **What:** Validates user is within allowed distance from registered QCC locations
- **Distance Calculation:** Haversine formula (accurate to meters)
- **Device-Specific Radius:** 
  - Configured per device type in `device_radius_settings` table
  - Default: 400 meters if not configured
  - Max accuracy buffer: +500 meters (prevents GPS drift exploitation)
- **Validation Logic:**
  - If `location_id` provided: Must be within `deviceCheckInRadius + 500m`
  - If no location provided: Nearest location must be within `deviceCheckInRadius + 500m`
- **Error:** 
  - If location provided but out of range: "You are outside the allowed proximity for this location. Auto check-in blocked."
  - If no location within range: "You are too far from any registered QCC location to check in."
- **Applies to:** Both Standard and Fast check-in
- **Bypass:** Only when `is_remote_location=true`
- **Security Logging:** Out-of-range attempts logged to `device_security_violations` table

### 4. **GPS Accuracy Check (Standard Only) ✅**
- **What:** Validates GPS accuracy is acceptable
- **Implementation:** Client sends accuracy value; server may validate
- **Applies to:** Standard check-in

### 5. **Suspicious Location Change Detection (Standard Only) ✅**
- **What:** Detects potential location spoofing by checking against recent history
- **Logic:**
  - Compares current location to average of last 5 check-ins
  - Flags as suspicious if > 100km from average
  - Logs anomaly but allows check-in (with audit trail)
- **Applies to:** Standard check-in

### 6. **Device Sharing Detection (Standard Only) ✅**
- **What:** Detects same device used by multiple users
- **Implementation:** Tracks `device_id` across users
- **Applies to:** Standard check-in

### 7. **Time-Based Restrictions (Client-Side Only)**
- **What:** Enforces check-in times (e.g., only during work hours)
- **Implementation:** Client-side validation before API call
- **Note:** Should be moved to server-side for security
- **Applies to:** Client requests

### 8. **Lateness Reason Requirements (Client-Side)**
- **What:** Requires reason if checking in after deadline
- **Implementation:** Client validation
- **Note:** Should be server-side enforced
- **Applies to:** Client requests

---

## Check-In API Endpoints

### **Standard Check-In** (`/api/attendance/check-in`)
**Validations Applied:**
- ✅ Duplicate check-in
- ✅ Leave status + override capability
- ✅ Geofence validation (range, device radius)
- ✅ GPS accuracy
- ✅ Suspicious location changes
- ✅ Device sharing detection
- ✅ Custom business logic (time restrictions, lateness)

### **Fast Check-In** (`/api/attendance/fast-check-in`) - NOW ALIGNED ✅
**Validations Applied (UPDATED):**
- ✅ Duplicate check-in
- ✅ Leave status (NEW)
- ✅ Geofence validation (range, device radius) (NEW)
- ❌ GPS accuracy (not enforced, assumed valid)
- ❌ Suspicious location changes (not needed for fast path)
- ❌ Device sharing detection
- ❌ Custom business logic (assumed pre-validated)

---

## Security Logging

### Tables Used:
1. **`device_security_violations`** - Logs:
   - Geofence mismatches
   - Out-of-range check-in attempts
   - Device/user mismatch
   - Double check-in attempts

2. **`audit_logs`** - Logs:
   - Suspicious location changes (>100km from normal)
   - Emergency overrides
   - System anomalies

---

## Fix Applied to Fast Check-In Route

**File:** `/app/api/attendance/fast-check-in/route.ts`

**Changes:**
1. Added `distanceMeters()` function (Haversine calculation)
2. Added leave status validation before check-in
3. Added comprehensive geofence validation:
   - Fetches active QCC locations + device radius settings
   - Validates user is within allowed distance
   - Logs security violations for out-of-range attempts
   - Returns appropriate error messages
4. Enhanced logging for anomaly detection

**Key Variables:**
- `qccLocations` - Active geofence locations from database
- `deviceCheckInRadius` - Device-specific allowed radius in meters
- `providedDistance` - Distance from user to selected location
- `nearest` - Closest location to user's GPS coordinates

---

## Testing the Fix

To verify the fix works correctly:

1. **Test Case 1: Out-of-Range Block**
   - User outside any QCC location radius
   - Expected: Check-in blocked with "too far" error
   - Logged: Security violation in database

2. **Test Case 2: Within Range Success**
   - User within device's allowed radius
   - Expected: Check-in succeeds
   - Logged: Normal attendance record

3. **Test Case 3: Leave Day Block**
   - User has approved leave
   - Expected: Check-in blocked with leave error

4. **Test Case 4: Duplicate Block**
   - User already checked in today
   - Expected: Check-in blocked with duplicate error

---

## Configuration Reference

### Device Radius Settings
Configure per device type in `device_radius_settings` table:
```
device_type: "mobile" | "tablet" | "desktop" | "kiosk"
check_in_radius_meters: 200-800 (adjust based on security needs)
is_active: true
```

### Geofence Locations
Configure locations in `geofence_locations` table:
```
name: "HEAD OFFICE SWANZY ARCADE"
latitude: [latitude]
longitude: [longitude]
radius_meters: [radius] (display purposes only)
is_active: true
```
