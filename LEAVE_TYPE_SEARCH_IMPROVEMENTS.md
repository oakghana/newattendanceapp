## Leave Type Selection UX Improvements

### Changes Made

#### 1. **Search Functionality for Leave Types**
- Added a search input field at the **top of the leave type selection** with a search icon
- Users can now filter leave types by typing (e.g., "annual", "sick", "maternity")
- Search is case-insensitive and matches both label and value
- Prevents "Annual Leave" from being always visible - users must search or scroll to find it

**Example:**
```
Search leave type... [🔍 input field]
- Sick Leave
- Maternity Leave
- Study Leave (With Pay)
```

#### 2. **End Date Field Always Available for Annual Leave**
- End Date field is now **required** for annual leave (marked with red asterisk *)
- End Date is automatically shown when annual leave is selected
- Validation prevents users from proceeding without both start AND end dates

#### 3. **Half-Day Restriction for Annual Leave**
- Half-day toggle is **disabled when Annual Leave is selected**
- Shows visual feedback: disabled state with reduced opacity
- Tooltip explains: "Annual leave requires full days"
- Automatically resets half-day to OFF when user switches to annual leave
- Warning message appears if user tries to use half-day with annual leave

#### 4. **Better UX Flow**
- After selecting leave type, search query is automatically cleared
- Clean state for dates step
- Reduced cognitive load with focused options

### User Benefits

✓ **Cleaner Interface** - Search reduces clutter, no forced "Annual Leave" visibility
✓ **Error Prevention** - Annual leave automatically enforces full days + both dates
✓ **Faster Selection** - Search helps users find specific leave types quickly
✓ **Better Compliance** - Prevents accidental annual leave misconfigurations

### Technical Details

- Uses React state for search query filtering
- Array filter with `.includes()` for flexible matching
- No additional dependencies required
- Fully integrated into existing leave request workflow
- Build: ✓ Compiled successfully, zero errors

### Files Modified
- `components/leave/leave-request-dialog.tsx`

All changes maintain backward compatibility and enhance the existing system.
