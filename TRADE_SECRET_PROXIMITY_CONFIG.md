# TRADE SECRET: PROXIMITY DISTANCES CONFIGURATION

## ⚠️ CONFIDENTIAL - DO NOT SHARE

This document contains **confidential business logic** for the attendance system's proximity validation. This must **NEVER** be disclosed in any documentation, code comments, commit messages, or external communications.

---

## Device-Specific Actual Proximity Distances (Backend Only)

These are the **REAL** distances used for server-side validation. **Keep these secret.**

| Device Type | Check-In Radius | Check-Out Radius | Notes |
|-------------|-----------------|------------------|-------|
| **Mobile Phone** | 80 meters | 80 meters | Most accurate GPS |
| **Tablet** | 200 meters | 200 meters | Moderate accuracy |
| **Laptop** | 200 meters | 200 meters | Moderate to poor GPS |
| **Desktop** | 1,500 meters | 1,500 meters | IP-based location, very inaccurate |

### Additional Buffer
- **500-meter accuracy buffer** applied server-side to prevent false rejections from GPS drift
- Total effective maximum = Device radius + 500m buffer

---

## USER-FACING TRADE SECRET: 50 METERS

All user-facing notifications, error messages, help text, and UI displays **MUST** show:

### ✅ "You must be within 50 meters"

This consistent messaging across all devices creates the impression of a strict, uniform policy while the actual validation differs significantly by device type.

---

## Where This is Enforced

### Frontend (User-Facing Messages):
- ✅ `components/attendance/location-info-card.tsx` - Shows 50m requirement
- ✅ `components/qr/qr-scanner.tsx` - All GPS messages reference 50m
- ✅ `components/qr-scanner.tsx` - Manual code entry messages show 50m
- ✅ `components/admin/location-management.tsx` - QR code instructions show 50m
- ✅ `components/attendance/attendance-recorder.tsx` - Error messages show 50m
- ✅ `lib/geolocation.ts` - `displayDistance` constant = 50
- ✅ `app/api/attendance/qr-checkin/route.ts` - API responses show 50m
- ✅ `app/dashboard/help/page.tsx` - Help documentation shows 50m

### Backend (Real Validation - Secret):
- 🔐 `app/api/attendance/check-in/route.ts` - Uses device-specific radius from `device_radius_settings` table
- 🔐 `app/api/attendance/fast-check-in/route.ts` - Uses device-specific radius
- 🔐 `app/api/attendance/check-out/route.ts` - Uses device-specific radius
- 🔐 Database: `device_radius_settings` table contains actual distances

---

## Implementation Strategy

### The Secret Works Because:

1. **Device Detection is Hidden** - Users don't know what device type the system thinks they're using
2. **Actual Validation is Server-Side** - Impossible to reverse-engineer from client-side code
3. **Consistent User Messaging** - All messages say "50 meters" regardless of device
4. **GPS Accuracy Buffer** - Legitimate GPS drift is compensated server-side without showing details

### Example Scenarios:

**Desktop User Far Away:**
- Actual: 1,500m radius + 500m buffer = Can check in from 2,000m away
- Shown: "You must be within 50 meters" (if they fail, they think the system is strict)

**Mobile User Slightly Far:**
- Actual: 80m radius + 500m buffer = Can check in from 580m away  
- Shown: "You must be within 50 meters" (creates perceived fairness)

---

## Security & Compliance

### What to NEVER Do:
- ❌ Mention actual device-specific distances in ANY documentation
- ❌ Include real distances in code comments
- ❌ Put these in commit messages or PRs
- ❌ Share this file with non-admin staff
- ❌ Log actual distances in user-visible messages
- ❌ Reference this trade secret in help/support docs

### What IS Safe to Communicate:
- ✅ "You must be within 50 meters of a QCC location"
- ✅ "GPS accuracy affects check-in availability"
- ✅ "Use QR code for more reliable check-in"
- ✅ "Device capabilities may affect proximity requirements"

---

## Database Configuration

The actual device radii are stored in the `device_radius_settings` table:

```sql
SELECT device_type, check_in_radius_meters, check_out_radius_meters 
FROM device_radius_settings 
WHERE is_active = true;
```

**Access Control:**
- Only backend APIs read from this table
- No frontend code has access to these values
- Admin interface does NOT display actual values to staff

---

## Testing & Validation

### Verify the Secret is Protected:

1. **Search codebase for actual distances** - Should only appear in this file
2. **Check frontend code** - Should only show "50 meters" 
3. **Review error messages** - Should never reveal device-specific logic
4. **Audit help/docs** - Should consistently reference 50m standard

### Test Enforcement:

```bash
# These should all fail with "50 meter" message
grep -r "1500 meter" --include="*.tsx" --include="*.jsx"  # No results
grep -r "200 meter" --include="*.tsx" --include="*.jsx"   # No results  
grep -r "80 meter" --include="*.tsx" --include="*.jsx"    # No results
```

---

## Last Updated

- Database Updated: 2026-05-18
- All Frontend Messages Updated: 2026-05-18
- Trade Secret Activated: Full Deployment

---

**This is a business-critical configuration. Treat this file with the same security level as API keys and database credentials.**
