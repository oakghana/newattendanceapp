/**
 * Backfill assigned_signers for existing payment memos that don't have them set.
 * This fixes the issue where previously created memos have NULL assigned_signers,
 * so approvers can't see them.
 *
 * Usage: npx ts-node --env-file-if-exists=/vercel/share/.env.project scripts/backfill-assigned-signers.ts
 */

import { createAdminClient } from "@/lib/supabase/server"

async function backfillAssignedSigners() {
  try {
    const admin = await createAdminClient()

    console.log("[v0] Starting backfill of assigned_signers for existing memos...")

    // Step 1: Find all memos with NULL assigned_signers
    const { data: memsWithoutSigners, error: fetchError } = await admin
      .from("leave_payment_memos")
      .select("id, memo_body, assigned_signers, status")
      .eq("status", "ready_for_review")
      .or("assigned_signers.is.null,assigned_signers.eq.[]")

    if (fetchError) {
      console.error("[v0] Error fetching memos without signers:", fetchError)
      return
    }

    console.log(`[v0] Found ${memsWithoutSigners?.length || 0} memos with missing assigned_signers`)

    if (!memsWithoutSigners || memsWithoutSigners.length === 0) {
      console.log("[v0] No memos to backfill - all have assigned_signers set")
      return
    }

    // Step 2: For each memo, extract the signer from memo_body and assign
    const updates: any[] = []
    for (const memo of memsWithoutSigners) {
      const memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body

      if (memoBody?.selectedSigner?.id) {
        updates.push({
          id: memo.id,
          assigned_signers: [memoBody.selectedSigner.id],
        })
      } else {
        console.warn(`[v0] Could not find signer ID in memo ${memo.id}`)
      }
    }

    console.log(`[v0] Updating ${updates.length} memos with extracted signers...`)

    // Step 3: Bulk update the memos
    for (const update of updates) {
      const { error: updateError } = await admin
        .from("leave_payment_memos")
        .update({ assigned_signers: update.assigned_signers })
        .eq("id", update.id)

      if (updateError) {
        console.error(`[v0] Error updating memo ${update.id}:`, updateError)
      }
    }

    console.log(`[v0] Backfill complete! Updated ${updates.length} memos`)

    // Verify the update
    const { data: updated } = await admin
      .from("leave_payment_memos")
      .select("id, assigned_signers")
      .eq("status", "ready_for_review")
      .limit(3)

    console.log("[v0] Sample of updated memos:", updated?.map(m => ({ id: m.id, signers: m.assigned_signers })))
  } catch (err) {
    console.error("[v0] Backfill failed:", err)
  }
}

backfillAssignedSigners()
