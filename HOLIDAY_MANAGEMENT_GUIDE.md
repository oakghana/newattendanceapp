# Holiday Management - User Guide

## Where to Add Holidays

**Location:** `Dashboard → Leave Management → Holiday Management Tab`

This is now directly accessible from the Leave Management module without needing to navigate to separate admin settings.

---

## Who Can Manage Holidays

The following roles have access to the Holiday Management tab:

1. **admin** - System administrator
2. **leave_admin** - Leave administration specialist
3. **hr_leave_office** - HR leave office staff
4. **hr_office** - HR office general staff
5. **director_hr** - HR director
6. **manager_hr** - HR manager

---

## How to Add Holidays

### Step-by-Step:

1. **Navigate to Holiday Management**
   - Go to Dashboard
   - Click "Leave Management" in sidebar
   - Click the **"Holiday Management"** tab (orange with settings icon)

2. **In the "Add New Holiday" section:**
   - **Date field**: Select holiday date using date picker (YYYY-MM-DD format)
   - **Holiday Name field**: Enter holiday name (e.g., "Christmas Day", "New Year")
   - Click **"+ Add Holiday"** button

3. **Holiday appears in the list**
   - Shows formatted date (e.g., "Monday, December 25, 2026")
   - Custom holidays marked with blue "Custom" badge
   - Can delete custom holidays anytime using trash icon

---

## Leave Year Configuration

On the same Holiday Management tab, you can also configure:

### Set Leave Year Period
- **Start Month**: Dropdown (January-December)
- **End Month**: Dropdown (January-December)
- Example: January 1 - December 31

### Leave Calculation Preferences
- **Exclude public holidays from calculations**: Checkbox
  - When enabled: Public holidays don't count as leave days
  - When disabled: Public holidays count as regular leave

- **Include weekends in calculations**: Checkbox
  - When enabled: Weekends count as leave days
  - When disabled: Only weekdays count as leave days

### Save Configuration
Click **"Save Configuration"** button to apply changes.

---

## Holiday Types

### System Holidays
- Pre-configured holidays (cannot be deleted)
- Fixed dates each year
- Examples: Standard public holidays

### Custom Holidays
- User-added holidays
- Marked with blue "Custom" badge
- Can be deleted anytime
- Use for organization-specific holidays, special leave dates, etc.

---

## Success/Error Messages

### Success Message (Green)
- "Holiday added" - Holiday successfully saved
- "Holiday deleted" - Holiday successfully removed
- "Calendar configuration saved" - Settings updated

### Error Message (Red)
- "Please enter date and name" - Missing required fields
- "Failed to add holiday" - System error adding holiday
- "Failed to delete holiday" - System error deleting holiday
- "Failed to load configuration" - Loading data error

---

## Example Use Cases

### Adding National Holidays
```
Date: 2026-01-01
Name: New Year's Day
```

### Adding Organization-Specific Days
```
Date: 2026-07-04
Name: Independence Day Holiday
```

### Adding Seasonal Closures
```
Date: 2026-08-15
Name: Annual Closure Week
```

---

## Managing Holiday Calendar

### View All Holidays
The "All Holidays" section shows:
- Holiday name
- Formatted date with day of week
- Custom badge if applicable
- Delete button for custom holidays

Scrollable list (max 10 at a time visible)

### Delete Holiday
1. Find the holiday in the list
2. Click the red trash icon on the right
3. Holiday is permanently removed
4. System shows success message

---

## Leave Calculation Impact

### When Holiday is Configured

**Example:**
- Staff requests leave: 12 May - 15 May (4 calendar days)
- 13 May is a public holiday

**If "Exclude holidays" is enabled:**
- Leave days counted: 3 (12, 14, 15 May)
- Holiday (13 May) doesn't consume leave days

**If "Exclude holidays" is disabled:**
- Leave days counted: 4 (all days)
- Holiday counts as normal leave day

---

## Best Practices

1. **Add holidays at beginning of year** - Configure all known holidays early for accurate leave calculations
2. **Use clear names** - Make holiday names descriptive for easy identification
3. **Update weekends setting** - Ensure correct work week configuration
4. **Review before changes** - Check what holidays already exist before adding duplicates
5. **Save configuration** - Don't forget to save after making month or calculation changes

---

## Technical Details

### API Endpoints Used

- `POST /api/admin/holidays` - Add new holiday
- `DELETE /api/admin/holidays/[id]` - Delete holiday
- `GET /api/admin/holidays` - Load holidays list
- `GET /api/admin/leave-calendar-config` - Load settings
- `POST /api/admin/leave-calendar-config` - Save settings

### Data Format

**Holiday Entry:**
```json
{
  "id": "uuid",
  "holiday_date": "2026-12-25",
  "holiday_name": "Christmas Day",
  "is_custom": true
}
```

**Calendar Config:**
```json
{
  "leave_year_start_month": 1,
  "leave_year_end_month": 12,
  "include_weekends_in_calculation": false,
  "exclude_holidays_in_calculation": true
}
```

---

## Troubleshooting

### Holiday not appearing in list
- Refresh the page
- Check browser console for errors
- Verify date format is correct (YYYY-MM-DD)

### Cannot delete holiday
- Only custom holidays can be deleted
- System holidays are protected
- Verify you have correct role permissions

### Leave calculation unchanged after adding holiday
- Check if "Exclude holidays" is enabled
- Verify holiday date is correct
- Save configuration after changes
- Refresh page and check leave calculations

### "Failed to add holiday" error
- Ensure date and name are both filled
- Check date format is valid
- Verify no duplicate holiday exists for that date

---

## Related Documentation

- `/LEAVE_ADMIN_ROLE_GUIDE.md` - Full leave admin capabilities
- `/BALANCE_CALENDAR_PERMISSIONS.md` - Calendar access control
- `/ROLE_BASED_ACCESS_CONTROL.md` - Complete permission matrix

