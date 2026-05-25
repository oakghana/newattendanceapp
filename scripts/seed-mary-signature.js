const { createClient } = require("@supabase/supabase-js")

// Simple test signature PNG (white background with dark blue)
// Minimal 50x18 PNG base64
const testSignatureBase64 = "iVBORw0KGgoAAAANSUhEUgAAADIAAAASCAYAAAAZsuwlAAAACXBIWXMAAAsTAAALEwEAmpwYAAABvklEQVR4nO2UwWrCQBCGZ3ZnEky8iHgReBC8SPEi5KL14FELXrzpxYsXL978Al48eRK8eRS8iAgievCgeFFEhIhRZu7stLHZZJvdTZoWVvawO/PNN/PbN7s1RVHg/+n1eqxWK5bLJYvFgvP5zHQ65Xg8cn0+nwA4HA7YbDZvx36/59frVXhM13W53W6C67qyXC7FdrtlvV4LrVZLXl9fhVarJbvdTqx5vV6i+4FIo9HgbDb7crnwul6v5XE4UFTVHwpXV1cC4Ol0Ep6maRweHwHIsiw8xmPsDwfM61z4TdM0b9SLxYL1eo3n+8zn82ezGYvFArPZjPl8zul04nQ6cTwehec0TePxeHy73V4ul2Jp8ePw+d2K3W5HUZRvKldXV0qlMhqNPvGn0yk6nQ7lcplGoyHtdltNJhPV6/XFG4PBQKlUS+VyuX68UX9PLCPJZFJtNhtVKBS+qUxGo1FKS0tLyjdOp5OKxWJqNBpltVpVkUhEuVxOxWIxdT6fVTgcVo1GQ2WzWTWZTFQ4HH7jQiAQUJVKRTWbTRWLxdRgMFA+n08dDgcVDAaVJElqNBpqNBqp0Wj0wfXPwQHQ6XRUOBz+xG/OHVbL5VKFQ6F/GxaLhQrH4ymjoV7PKcwyAqoIIKQwAoVRKIxCYRSFwgAoDpFCGIXCKBRGIdBfpw3GVx6lXKMAAAAASUVORK5CYII="

async function seedMarySignature() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("Missing Supabase credentials")
    process.exit(1)
  }

  const supabase = createClient(url, key)

  // Find Mary Allotey
  const { data: users, error: usersError } = await supabase
    .from("unified_user_management")
    .select("user_id, first_name, last_name")
    .or("first_name.ilike.%mary%, last_name.ilike.%allotey%")
    .limit(1)

  if (usersError) {
    console.error("Error finding Mary:", usersError)
    process.exit(1)
  }

  if (!users || users.length === 0) {
    console.error("Mary not found")
    process.exit(1)
  }

  const mary = users[0]
  console.log(`Found Mary: ${mary.first_name} ${mary.last_name} (ID: ${mary.user_id})`)

  // Check if she already has a signature
  const { data: existing } = await supabase
    .from("approval_signature_registry")
    .select("id")
    .eq("user_id", mary.user_id)

  if (existing && existing.length > 0) {
    console.log("Mary already has a signature. Updating...")
    const { error: updateError } = await supabase
      .from("approval_signature_registry")
      .update({
        signature_data_url: `data:image/png;base64,${testSignatureBase64}`,
        is_active: true,
        updated_at: new Date().toISOString(),
        workflow_domain: "leave",
        approval_stage: "hr_approval"
      })
      .eq("user_id", mary.user_id)

    if (updateError) {
      console.error("Error updating signature:", updateError)
      process.exit(1)
    }
    console.log("Signature updated successfully!")
  } else {
    console.log("Creating new signature for Mary...")
    const { error: insertError } = await supabase
      .from("approval_signature_registry")
      .insert({
        user_id: mary.user_id,
        signature_data_url: `data:image/png;base64,${testSignatureBase64}`,
        signature_mode: "test",
        is_active: true,
        workflow_domain: "leave",
        approval_stage: "hr_approval"
      })

    if (insertError) {
      console.error("Error inserting signature:", insertError)
      process.exit(1)
    }
    console.log("Test signature created successfully!")
  }

  console.log("\nMary Allotey now has a saved signature!")
  console.log("Next payment advice memo generated will show her signature image.")
}

seedMarySignature()
