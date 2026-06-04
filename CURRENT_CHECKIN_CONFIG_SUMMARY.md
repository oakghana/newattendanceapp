# Current Check-In/Check-Out Configuration Summary

## 1. DEVICE DISTANCE FOR CHECK-IN AND CHECK-OUT

### Device-Specific Proximity Distances

| Device Type | Check-In Radius | Check-Out Radius | Notes |
|-------------|-----------------|------------------|-------|
| **Mobile Phone** | 100 meters | 100 meters | Most accurate GPS |
| **Tablet** | 150 meters | 150 meters | Good accuracy |
| **Laptop** | 200 meters | 200 meters | WiFi-based location service |
| **Desktop** | 2,000 meters | 1,500 meters | IP-based location (WiFi triangulation) |

### Additional Configuration:
- **QCC Location Geofence**: 50 meters radius for all active QCC locations across Ghana
- **Accuracy Buffer**: 500 meters applied server-side to prevent GPS drift
- **Total Effective Maximum**: Device radius + 500m buffer

### Key Points:
✅ Mobile devices have strictest requirements (100m) due to accurate built-in GPS  
✅ Desktop computers have the most lenient requirements (1,500-2,000m) due to WiFi-based location  
✅ All QCC locations use a uniform 50-meter radius around their GPS coordinates  
✅ Desktop check-out radius is smaller (1,500m) to encourage staff to be closer when leaving  

### User-Facing Communication:
All user-facing messages, error notifications, and UI displays consistently show **"50 meters"** requirement to create uniform policy perception, while the backend uses device-specific radii for practical validation.

---

## 2. LATE CHECK-IN REASON COLLECTION

### Lateness Requirement Policy

**YES - Staff ARE Required to Provide Reasons for Late Check-In After 9:00 AM**

### When Lateness Reason is Required:
- ✅ **Weekdays Only** (Monday - Friday)
- ✅ **After 9:00 AM** (configurable via `latenessReasonDeadline` in system settings, default: "09:00")
- ✅ **All staff except managers and admins** (unless explicitly exempted)

### Implementation Details:

**API Validation (Line 693 of `/app/api/attendance/check-in/route.ts`):**
```typescript
const latenessRequired = requiresLatenessReason(checkInTime, userProfile?.departments, userProfile?.role)
if (isLateArrival && latenessRequired && (!lateness_reason || lateness_reason.trim().length === 0)) {
  return NextResponse.json({
    error: "Lateness reason is required when checking in after 9:00 AM",
    requiresLatenessReason: true,
    checkInTime: checkInTime.toLocaleTimeString(),
  }, { status: 400 })
}
```

**Database Storage:**
- Field: `lateness_reason` (in `attendance_records` table)
- Optional Fields:
  - `lateness_proved_by` - Who verified the reason (text)
  - `lateness_proved_by_id` - ID of verifier (user_id)

### Who is EXEMPTED from Lateness Reason:

1. **Role-based Exemptions:**
   - Admins
   - Super Admins
   - Department Heads
   - Head of Department
   - Regional Managers

2. **Department-based Exemptions:**
   - Security Department staff
   - Operational Department staff
   - Transport Department staff

### Late Arrival Detection:
- Check-in time > 9:00 AM (configurable)
- System marks attendance as `status: "late"`

### Late Check-In Blocking:
- **Before 3:30 PM** - Regular staff can check in (with reason if after 9 AM)
- **After 3:30 PM** - Regular staff cannot check in (unless exempt role/department)
- **Anytime** - Exempt staff can check in

### Implementation Function:
Located in `/lib/attendance-utils.ts`:
```typescript
export function requiresLatenessReason(
  date: Date = new Date(),
  dept?: DeptInfo,
  role?: string | null,
  config?: AttendanceTimeConfig,
): boolean {
  if (isWeekend(date)) return false  // No reason needed on weekends
  const deadlineStr = config?.latenessReasonDeadline ?? "09:00"
  const [deadlineHour, deadlineMin] = deadlineStr.split(":").map(Number)
  const hours = date.getHours()
  const minutes = date.getMinutes()
  return hours > deadlineHour || (hours === deadlineHour && minutes >= deadlineMin)
}
```

---

## 3. COMPLETE ATTENDANCE TIME RESTRICTIONS

### Check-In Restrictions:
| User Type | Deadline | Can Check In Anytime? | Requires Reason? |
|-----------|----------|:---:|:---:|
| Regular Staff | 3:30 PM | ❌ No | ✅ Yes (if after 9 AM) |
| Managers/Admins | None | ✅ Yes | ❌ No |
| Security Dept | None | ✅ Yes | ❌ No |
| Operational Dept | None | ✅ Yes | ❌ No |
| Transport Dept | None | ✅ Yes | ❌ No |

### Check-Out Restrictions:
| User Type | Deadline | Can Check Out Anytime? |
|-----------|----------|:---:|
| Regular Staff | 11:00 PM | ❌ Limited |
| Managers/Admins | None | ✅ Yes |
| Exempt Staff | None | ✅ Yes |

---

## 4. REASON COLLECTION IN FRONTEND

The frontend prompts for lateness reasons in the check-in interface when:
1. Current time is after 9:00 AM
2. User is not exempted (not a manager/admin/security/operational/transport)
3. User confirms they want to check in late

### Frontend Components that Handle This:
- `components/attendance/attendance-recorder.tsx`
- `components/attendance/optimized-check-in-card.tsx`
- `components/qr/qr-scanner.tsx`

---

## 5. CONFIGURATION FILES

### Database Tables Involved:
1. **`device_radius_settings`** - Device-specific proximity distances
2. **`geofence_locations`** - QCC location coordinates and radii
3. **`attendance_records`** - Check-in/check-out records with lateness reasons
4. **`system_settings`** - Global configuration (latenessReasonDeadline, etc.)

### Key Configuration Points:
```sql
-- Update lateness deadline (in system_settings table)
UPDATE system_settings 
SET geo_settings = jsonb_set(geo_settings, '{latenessReasonDeadline}', '"09:00"');

-- Update device radius
UPDATE device_radius_settings 
SET check_in_radius_meters = 150 
WHERE device_type = 'mobile';
```

---

## 6. TRADE SECRET IMPLEMENTATION

**Important Note:** The system uses a "unified messaging" approach where:
- **User-facing messages always say "50 meters"** (to create uniform policy perception)
- **Backend validates using device-specific radii** (for practical accuracy)
- This is intentional to avoid confusing users with varying distance requirements

Files that enforce this messaging pattern:
- `components/attendance/location-info-card.tsx`
- `components/qr/qr-scanner.tsx`
- `components/qr-scanner.tsx`
- `components/attendance/attendance-recorder.tsx`
- `app/dashboard/help/page.tsx`

---

## 7. SUMMARY TABLE

| Aspect | Setting | Details |
|--------|---------|---------|
| **Strictest Device** | Mobile | 100m radius + 500m buffer = 600m max |
| **Most Lenient Device** | Desktop | 2,000m radius + 500m buffer = 2,500m max |
| **QCC Locations** | All | 50m radius each |
| **Late Threshold** | 9:00 AM | Configurable |
| **Check-In Deadline** | 3:30 PM | Regular staff cannot check in after this |
| **Check-Out Deadline** | 11:00 PM | Regular staff cannot check out after this |
| **Reason Required?** | YES | When checking in after 9:00 AM |
| **Weekends** | No restrictions | Lateness not tracked on weekends |

---

## 8. DATA COLLECTION STATUS

✅ **Late Check-In Reasons ARE Being Collected**

Evidence:
- Database field `lateness_reason` stores the reason text
- API validates that reason is provided (line 693)
- Frontend prompts user for reason before accepting late check-in
- Verifier information is also stored (`lateness_proved_by`, `lateness_proved_by_id`)

### To View Collected Reasons:
```sql
SELECT 
  up.first_name,
  up.last_name,
  ar.check_in_time,
  ar.lateness_reason,
  ar.lateness_proved_by,
  ar.status
FROM attendance_records ar
JOIN user_profiles up ON ar.user_id = up.id
WHERE ar.status = 'late' 
  AND ar.lateness_reason IS NOT NULL
  AND DATE(ar.check_in_time) >= '2026-05-01'
ORDER BY ar.check_in_time DESC;
```

---

**Last Updated:** 2026-06-04  
**Document Type:** System Configuration Reference  
**Scope:** Check-In/Check-Out Proximity and Lateness Reason Collection
