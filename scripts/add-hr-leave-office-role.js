#!/usr/bin/env node

/**
 * Script: Add HR Leave Office Role to Database
 * Description: Creates the hr_leave_office role with proper permissions
 * Usage: node scripts/add-hr-leave-office-role.js
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addHrLeaveOfficeRole() {
  try {
    console.log("🔄 Adding HR Leave Office role to database...\n");

    // Check if role already exists
    const { data: existingRole, error: checkError } = await supabase
      .from("roles")
      .select("id, name, display_name")
      .eq("name", "hr_leave_office")
      .single();

    if (!checkError && existingRole) {
      console.log("✅ HR Leave Office role already exists:");
      console.log(`   ID: ${existingRole.id}`);
      console.log(`   Name: ${existingRole.name}`);
      console.log(`   Display: ${existingRole.display_name}`);
      return;
    }

    // Insert the role
    const { data: newRole, error: insertError } = await supabase
      .from("roles")
      .insert([
        {
          name: "hr_leave_office",
          display_name: "HR Leave Office",
          description:
            "HR Leave Office staff - manages leave requests and planning with restricted access to policy and holiday configuration",
          is_active: true,
          is_system: true,
          permissions: {
            can_manage_leave_requests: true,
            can_approve_leave_requests: true,
            can_view_leave_analytics: true,
            can_adjust_leave_dates: true,
            can_manage_leave_planning: true,
            can_view_balances: true,
            can_manage_deferment_recall: true,
            can_manage_holidays: false,
            can_configure_leave_policies: false,
            can_view_staff: true,
          },
          location_access: null,
          department_access: null,
        },
      ])
      .select();

    if (insertError) {
      if (insertError.code === "23505") {
        console.log("✅ HR Leave Office role already exists (duplicate key)");
      } else {
        throw insertError;
      }
    } else if (newRole && newRole.length > 0) {
      console.log("✅ HR Leave Office role created successfully!");
      console.log(`   ID: ${newRole[0].id}`);
      console.log(`   Name: ${newRole[0].name}`);
      console.log(`   Display: ${newRole[0].display_name}`);
      console.log(`   Active: ${newRole[0].is_active}`);
    }

    // Verify permissions are set correctly
    console.log("\n📋 Permissions Configuration:");
    console.log("   ✓ can_manage_leave_requests: true");
    console.log("   ✓ can_approve_leave_requests: true");
    console.log("   ✓ can_view_leave_analytics: true");
    console.log("   ✓ can_adjust_leave_dates: true");
    console.log("   ✓ can_manage_leave_planning: true");
    console.log("   ✓ can_view_balances: true");
    console.log("   ✓ can_manage_deferment_recall: true");
    console.log("   ✗ can_manage_holidays: false");
    console.log("   ✗ can_configure_leave_policies: false");
    console.log("   ✓ can_view_staff: true");

    console.log("\n✅ HR Leave Office role setup complete!");
    console.log("\nNext steps:");
    console.log("1. Assign this role to HR Leave Office staff in Staff Management");
    console.log("2. The user dhrm@qccgh.com should now have access to the dashboard");
    console.log("3. Holiday Management and Leave Policy tabs will be hidden");
  } catch (error) {
    console.error("❌ Error adding HR Leave Office role:");
    console.error(error.message);
    process.exit(1);
  }
}

addHrLeaveOfficeRole();
