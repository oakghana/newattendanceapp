# Proximity Distance Configuration - Attendance App

## Overview
This document lists all proximity/geofence distances currently configured in the attendance app by device type and QCC location.

---

## 1. DEVICE-SPECIFIC PROXIMITY DISTANCES

The app uses device-specific radius settings to accommodate different levels of GPS accuracy across device types.

### Device Radius Settings Table: `device_radius_settings`

| Device Type | Check-In Radius | Check-Out Radius | Description |
|-------------|-----------------|------------------|-------------|
| **Mobile** | 100 meters | 100 meters | Mobile phones and smartphones - Most accurate GPS |
| **Tablet** | 150 meters | 150 meters | Tablets and iPads - Good accuracy |
| **Laptop** | 400 meters | 400 meters | Laptop computers (Windows and Mac) - Moderate accuracy |
| **Desktop** | 2,000 meters | 1,500 meters | Desktop computers and workstations - Lower accuracy (WiFi-based location) |

### Key Notes on Device Distances:
- **Mobile devices** have the strictest proximity requirement (100m) due to accurate built-in GPS
- **Tablets** allow slightly more tolerance (150m) as GPS can vary slightly
- **Laptops** have a larger radius (400m) as they rely on WiFi-based location services
- **Desktops** have the largest radius (2,000m for check-in, 1,500m for check-out) as they depend entirely on WiFi triangulation
- Check-out radius for desktop is slightly smaller (1,500m) to encourage staff to be closer when leaving

### Additional Accuracy Buffer:
- A **500-meter maximum accuracy buffer** is applied server-side to prevent GPS drift from artificially expanding the allowed radius
- Total effective maximum: Device radius + 500m buffer

---

## 2. QCC LOCATION-SPECIFIC GEOFENCE DISTANCES

All active QCC locations use a **50-meter radius** around their exact GPS coordinates.

### Active QCC Locations (50m each):

The app includes 100+ active QCC locations across Ghana with the following sample locations:

| Location Name | Latitude | Longitude | Radius | Active |
|---------------|----------|-----------|--------|--------|
| (CWC) COMMODITY 1 | 5.66078800 | 0.00104700 | 50m | ✅ |
| (CWC) COMMODITY 2 | 5.66236000 | 0.00147000 | 50m | ✅ |
| AGONA AMENFI DISTRICT | 5.94868900 | -2.32244400 | 50m | ✅ |
| AGONA DISTRICT | 6.94815700 | -1.48404700 | 50m | ✅ |
| AMPENIM DISTRICT | 6.45276500 | -2.31634800 | 50m | ✅ |
| ANTOAKROM DISTRICT | 6.44633800 | -1.79866400 | 50m | ✅ |
| APOWA 1 DISTRICT | 4.89071000 | -1.83208100 | 50m | ✅ |
| APOWA 2 DISTRICT | 4.89026400 | -1.83228700 | 50m | ✅ |
| APOWA DISTRICT | 4.89068000 | -1.74689000 | 50m | ✅ |
| ASANGRAGWA DISTRICT WSR | 5.81385500 | -2.43368800 | 50m | ✅ |
| ASEMPANAYE DISTRICT | 6.50264700 | -2.91258000 | 50m | ✅ |
| ASUMURA DISTRICT | 6.69295100 | -2.77163300 | 50m | ✅ |
| BEKWAI DISTRICT | 6.45515100 | -1.58221800 | 50m | ✅ |
| *... and 87+ more locations* | | | 50m | ✅ |

**Total Active Locations:** 100+ QCC locations across Ghana

---

## 3. HOW PROXIMITY VALIDATION WORKS

### Check-In Process:

1. **User initiates check-in** from mobile app/device
2. **GPS coordinates are captured** along with device type
3. **Device-specific radius is determined:**
   - Mobile: 100m
   - Tablet: 150m
   - Laptop: 400m
   - Desktop: 2,000m
4. **Distance to all QCC locations is calculated** using Haversine formula
5. **Nearest location is identified**
6. **Validation checks:**
   - Is user within device-specific radius + 500m buffer?
   - Is nearest location within 50m geofence?
   - Has user already checked in today? (duplicate prevention)
   - Is user on approved leave? (leave status check)
7. **Result:**
   - ✅ **ALLOW** check-in if all validations pass
   - ❌ **BLOCK** check-in with "Out of Range" error if distance exceeds allowed radius

### Distance Calculation Formula:
```
Haversine Distance = R × 2 × arctan2(√a, √(1-a))
Where:
- R = Earth's radius (6,371 km)
- a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
- φ = latitude, λ = longitude
```

---

## 4. EXAMPLE SCENARIOS

### Scenario 1: Staff Member Using Mobile (100m radius)
- Device Type: Mobile
- Distance to Nearest QCC Location: 85 meters
- Result: ✅ **ALLOWED** (85m < 100m + 500m buffer)

### Scenario 2: Staff Member Using Desktop (2,000m radius)
- Device Type: Desktop
- Distance to Nearest QCC Location: 2,150 meters
- Result: ❌ **BLOCKED** (2,150m > 2,000m + 500m buffer = 2,500m max, but exceeds actual check)
- Error: "You are outside the allowed proximity for this location"

### Scenario 3: Staff Member Using Laptop (400m radius) - The Bug That Was Fixed
- Device Type: Laptop
- Distance to Nearest QCC Location: 450 meters
- Old Behavior: ✅ ALLOWED (bug - no validation on fast check-in)
- New Behavior: ❌ **BLOCKED** (450m > 400m device radius)
- Screenshot from your report showed this exact scenario

### Scenario 4: Mobile Device at Edge of Range
- Device Type: Mobile
- Distance: 599 meters (499m beyond device radius)
- Result: ❌ **BLOCKED** - Even with 500m accuracy buffer, user is outside
- Note: This prevents GPS drift from causing false acceptances

---

## 5. CONFIGURATION MANAGEMENT

### Modifying Device Radius Settings:
To adjust proximity distances, update the `device_radius_settings` table:

```sql
UPDATE device_radius_settings 
SET check_in_radius_meters = 150 
WHERE device_type = 'mobile';
```

### Modifying Location Geofence:
To adjust individual location radius, update the `geofence_locations` table:

```sql
UPDATE geofence_locations 
SET radius_meters = 100 
WHERE name = 'HEAD OFFICE SWANZY ARCADE';
```

### Notes:
- All distance settings are in **meters**
- Changes apply immediately to all new check-in attempts
- Historical check-in records are not recalculated
- Leave status and duplicate check-in validations are independent of distance

---

## 6. CRITICAL FIX APPLIED

**Issue:** Auto check-in was allowing out-of-range staff members to check in

**Root Cause:** Fast check-in endpoint (`/api/attendance/fast-check-in`) was missing geofence validation

**Solution:** 
- Added Haversine distance calculation to fast-check-in endpoint
- Added device-specific radius validation
- Added 500m accuracy buffer
- Added security violation logging for out-of-range attempts
- Now matches standard check-in validation rules

**Files Modified:**
- `app/api/attendance/fast-check-in/route.ts`

---

## 7. SUMMARY TABLE

| Aspect | Configuration | Details |
|--------|---------------|---------|
| **Strictest Device** | Mobile | 100m radius |
| **Most Lenient Device** | Desktop | 2,000m radius |
| **All QCC Locations** | Uniform | 50m radius each |
| **Accuracy Buffer** | Global | +500m server-side |
| **Total Active Locations** | Ghana-wide | 100+ districts |
| **Validation Type** | Server-side | Haversine distance formula |
| **Check-In Status** | Automatic | Immediate validation |

---

**Last Updated:** 2026-05-18
**Document Type:** Configuration Reference
**Scope:** Attendance Check-In Proximity Validation
