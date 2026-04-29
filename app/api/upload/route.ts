import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error: "File upload storage is not configured.",
          code: "BLOB_NOT_CONFIGURED",
          message: "Set BLOB_READ_WRITE_TOKEN in environment variables to enable uploads.",
        },
        { status: 503 },
      )
    }

    // Verify user is authenticated
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 5MB" }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 })
    }

    // Upload to Vercel Blob with user-specific path
    const filename = `leave-documents/${user.id}/${Date.now()}-${file.name}`
    const blob = await put(filename, file, {
      access: "public",
      addRandomSuffix: false,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error: any) {
    console.error("[v0] Upload error:", error)
    const message = String(error?.message || "Upload failed")
    if (message.toLowerCase().includes("blob_read_write_token") || message.toLowerCase().includes("no token")) {
      return NextResponse.json(
        {
          error: "File upload storage is not configured.",
          code: "BLOB_NOT_CONFIGURED",
          message: "Set BLOB_READ_WRITE_TOKEN in environment variables to enable uploads.",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: message || "Upload failed" }, { status: 500 })
  }
}
