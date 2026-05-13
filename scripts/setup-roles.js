/**
 * Setup Script: Add Missing Roles to Staff Management Module
 * 
 * This script adds the "Loan Office Admin" and other administrative roles to the Supabase database.
 * 
 * Usage:
 * node scripts/setup-roles.js
 * 
 * Environment Variables Required:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for admin operations
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Error: Missing required environment variables");
  console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupRoles() {
  console.log("=== Setting up Staff Management Roles ===\n");

  try {
    // Define the roles to add/update
    const rolesToSetup = [
      {
        name: "loan_office_admin",
        display_name: "Loan Office Admin",
        description: "Administrator for loan office operations and staff management",
        permissions: {
          can_manage_loans: true,
          can_manage_staff: true,
          can_approve_loans: false,
          can_view_analytics: true,
        },
      },
      {
        name: "loan_office",
        display_name: "Loan Office",
        description: "Loan office staff processing loans",
        permissions: {
          can_manage_loans: true,
          can_manage_staff: false,
          can_approve_loans: false,
          can_view_analytics: false,
        },
      },
      {
        name: "accounts",
        display_name: "Accounts",
        description: "Accounts/Finance staff",
        permissions: {
          can_manage_loans: false,
          can_manage_staff: false,
          can_approve_loans: false,
          can_view_analytics: true,
        },
      },
      {
        name: "hr_office",
        display_name: "HR Office",
        description: "HR Office staff managing leave office operations",
        permissions: {
          can_manage_leaves: true,
          can_adjust_leave_dates: true,
          can_approve_leaves: false,
          can_view_staff: true,
        },
      },
      {
        name: "regional_hr_leave",
        display_name: "Regional HR Leave",
        description: "Regional HR Leave administrator",
        permissions: {
          can_manage_regional_leaves: true,
          can_view_analytics: true,
          can_approve_leaves: false,
        },
      },
    ];

    console.log(`Found ${rolesToSetup.length} roles to set up\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const role of rolesToSetup) {
      try {
        console.log(`Processing role: ${role.name}...`);

        // First, try to get existing role
        const { data: existingRole } = await supabase
          .from("roles")
          .select("*")
          .eq("name", role.name)
          .single();

        if (existingRole) {
          // Update existing role
          const { error: updateError } = await supabase
            .from("roles")
            .update({
              display_name: role.display_name,
              description: role.description,
              permissions: role.permissions,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("name", role.name);

          if (updateError) {
            console.error(`  ❌ Error updating role: ${updateError.message}`);
            errorCount++;
          } else {
            console.log(`  ✓ Updated existing role: ${role.display_name}`);
            successCount++;
          }
        } else {
          // Insert new role
          const { error: insertError } = await supabase.from("roles").insert({
            name: role.name,
            display_name: role.display_name,
            description: role.description,
            permissions: role.permissions,
            is_active: true,
            is_system: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          if (insertError) {
            console.error(`  ❌ Error inserting role: ${insertError.message}`);
            errorCount++;
          } else {
            console.log(`  ✓ Created new role: ${role.display_name}`);
            successCount++;
          }
        }
      } catch (error) {
        console.error(`  ❌ Unexpected error processing ${role.name}: ${error.message}`);
        errorCount++;
      }
    }

    console.log("\n=== Setup Summary ===");
    console.log(`✓ Successfully processed: ${successCount} roles`);
    if (errorCount > 0) {
      console.log(`❌ Errors encountered: ${errorCount}`);
    }

    // Verify the roles
    console.log("\n=== Verifying Roles ===");
    const { data: allRoles, error: fetchError } = await supabase
      .from("roles")
      .select("id, name, display_name, is_active")
      .in("name", ["loan_office_admin", "loan_office", "accounts", "hr_office", "regional_hr_leave"])
      .order("name");

    if (fetchError) {
      console.error("Error fetching roles:", fetchError.message);
    } else {
      console.log(`Found ${allRoles.length} roles in database:`);
      allRoles.forEach((role) => {
        console.log(`  • ${role.display_name} (${role.name}) - ${role.is_active ? "Active" : "Inactive"}`);
      });
    }

    console.log("\n✓ Role setup complete!");
    console.log("\nNext steps:");
    console.log("1. Restart your development server: npm run dev");
    console.log("2. Navigate to Staff Management module");
    console.log("3. New roles will now appear in the role selection dropdown");
    console.log("4. You can now assign staff to these roles");

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the setup
setupRoles();
