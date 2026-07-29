# Test Users Guide

## Available Demo Users

The following demo users are pre-configured in the database and can be used for testing. They are defined in `/scripts/012_create_demo_users.sql`.

### To Create a Test User

1. Sign up a new user at `/auth/signup` using one of the configured demo emails below
2. The user profile will be automatically created with the pre-defined role and details
3. Use the same email and password to log in

### Demo User Accounts

| Email | Password | Role | Name | Employee ID | Description |
|-------|----------|------|------|------------|-------------|
| `hod.academic@qccgh.com` | `pa$w0rd` | department_head | Dr. Kwame Asante | QCC-HOD-001 | Head of Academic Affairs |
| `hod.student@qccgh.com` | `pa$w0rd` | department_head | Mrs. Akosua Mensah | QCC-HOD-002 | Head of Student Affairs |
| `hod.finance@qccgh.com` | `pa$w0rd` | department_head | Mr. Kofi Boateng | QCC-HOD-003 | Head of Finance Department |
| `admin.system@qccgh.com` | `pa$w0rd` | admin | Mr. Emmanuel Osei | QCC-ADM-001 | System Administrator |
| `admin.hr@qccgh.com` | `pa$w0rd` | admin | Ms. Abena Adjei | QCC-ADM-002 | HR Administrator |
| `admin.ops@qccgh.com` | `pa$w0rd` | admin | Mr. Yaw Appiah | QCC-ADM-003 | Operations Administrator |

### Role-Based Permissions

- **admin**: Full system access, can access all modules
- **department_head**: Can manage their department, view reports, manage staff linkages  
- **manager_hr**: HR module access, leave management, staff admin
- **loan_officer** / **hr_officer**: Loan processing, can access Loan Office module
- **staff**: Basic attendance check-in, view personal leave and loan requests

### Accessing the Loan Office

**Required Role**: `loan_officer`, `hr_officer`, `manager_hr`, or `admin`

To test the Loan Office dashboard:
1. Log in with one of the admin or manager_hr users above
2. Navigate to the Loan Administration section
3. You should see all Loan Office tabs: Setup & Linkage, My Loans, Tracking, etc.

### Testing the Setup & Linkage Tab

1. Log in as an admin or manager_hr user
2. Go to **Loan Administration** → **Setup & Linkage**
3. Test features:
   - **Loan Types**: Configure different loan products and their terms
   - **Staff Linkage**: Link individual staff to their HOD/Manager
   - **Bulk Linkage**: Link multiple staff to one HOD in batch
   - **Linkage Map**: View the current staff-to-HOD relationships

### Creating Custom Test Users

If you need additional test users with specific roles or permissions:

1. **Sign up at `/auth/signup`** with a new email using `@qccgh.com` domain
2. **Create a user profile** via the database:
   ```sql
   INSERT INTO user_profiles (
     id, email, first_name, last_name, employee_id, role, position, is_active
   ) VALUES (
     'user-id-from-auth',
     'newuser@qccgh.com',
     'First', 'Last',
     'STAFF-ID-001',
     'hr_officer',  -- Change role as needed
     'HR Loan Officer',
     true
   );
   ```

3. The role must match one of the defined role constants in `lib/auth.ts`

### Troubleshooting Login Issues

**Error: "Invalid credentials"**
- Ensure you're using the correct email and password from the table above
- If creating a new user, ensure they've completed the auth signup flow first
- Check that the user profile was created with the correct role

**Error: "Account not approved"**
- New users may require admin approval (controlled by `REQUIRE_USER_APPROVAL` setting)
- Admin users can approve accounts in the admin panel

**Can't access Loan Office**
- Verify your user role is one of: `loan_officer`, `hr_officer`, `manager_hr`, or `admin`
- Check your user profile's `role` column in the database
- Recent role changes may require a page refresh or re-login

## Dashboard Navigation

After successful login, you're redirected to `/dashboard/attendance`. From there:

- **Top Navigation Bar**: Switch between Attendance, Leave, and Loan Administration
- **Loan Administration Menu**: Select Setup & Linkage, My Loans, Tracking, Accounts, etc.
- **Profile**: Click your name to access profile settings and change password

Happy testing!
