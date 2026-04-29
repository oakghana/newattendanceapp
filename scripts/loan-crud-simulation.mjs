const loanTypes = [
  { key: "funeral_loan_junior", fixedAmount: 10000, requiresFdCheck: false, committee: false },
  { key: "car_loan_senior", fixedAmount: 25000, requiresFdCheck: true, committee: true },
]

const requests = new Map()

function isQualifiedForLoan(loanTypeKey, staffRank) {
  const key = String(loanTypeKey || "").toLowerCase()
  const rank = String(staffRank || "").toLowerCase()
  const isSeniorOrAbove = /senior|\bsr\b|sr\.|manager|head|director|regional/.test(rank)
  const isManagerOrAbove = /manager|head|director|regional/.test(rank)

  if (key.includes("_manager")) return isManagerOrAbove
  if (key.includes("_senior")) return isSeniorOrAbove
  return true
}

function createRequest({ userId, rank, loanTypeKey, reason = null }) {
  const lt = loanTypes.find((x) => x.key === loanTypeKey)
  if (!lt) throw new Error("Loan type not found")
  if (!isQualifiedForLoan(loanTypeKey, rank)) throw new Error("Not qualified for selected loan type")

  const id = `SIM-${Date.now()}`
  const row = {
    id,
    userId,
    loanTypeKey,
    fixedAmount: lt.fixedAmount,
    requestedAmount: lt.fixedAmount,
    reason,
    requiresFdCheck: lt.requiresFdCheck,
    committeeRequired: lt.committee,
    status: "pending_hod",
    timeline: [{ action: "create", status: "pending_hod" }],
  }
  requests.set(id, row)
  return row
}

function readRequest(id) {
  const row = requests.get(id)
  if (!row) throw new Error("Request not found")
  return row
}

function updateRequest(id, patch) {
  const row = readRequest(id)
  const next = { ...row, ...patch }
  requests.set(id, next)
  next.timeline.push({ action: "update", status: next.status })
  return next
}

function workflowAction(id, action, payload = {}) {
  const row = readRequest(id)

  if (action === "hod_approve" && row.status === "pending_hod") row.status = "hod_approved"
  if (action === "loan_office_forward" && row.status === "hod_approved") row.status = row.requiresFdCheck ? "sent_to_accounts" : "awaiting_hr_terms"
  if (action === "accounts_fd" && row.status === "sent_to_accounts") {
    const fd = Number(payload.fdScore || 0)
    row.status = fd > 39 ? (row.committeeRequired ? "awaiting_committee" : "awaiting_hr_terms") : "rejected_fd"
  }
  if (action === "committee_approve" && row.status === "awaiting_committee") row.status = "awaiting_hr_terms"
  if (action === "hr_terms" && row.status === "awaiting_hr_terms") row.status = "awaiting_director_hr"
  if (action === "director_approve" && row.status === "awaiting_director_hr") row.status = "approved_director"

  row.timeline.push({ action, status: row.status })
  requests.set(id, row)
  return row
}

function deleteRequest(id) {
  if (!requests.has(id)) throw new Error("Request not found")
  requests.delete(id)
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg)
}

function runSimulation() {
  const created = createRequest({
    userId: "user-1",
    rank: "Sr. Qual. Cont. Asst.",
    loanTypeKey: "car_loan_senior",
  })

  assert(created.requestedAmount === 25000, "Amount must auto-populate from fixed loan type")

  const read = readRequest(created.id)
  assert(read.status === "pending_hod", "Create status should be pending_hod")

  const updated = updateRequest(created.id, { reason: "Updated optional reason" })
  assert(updated.reason === "Updated optional reason", "Update should work")

  workflowAction(created.id, "hod_approve")
  workflowAction(created.id, "loan_office_forward")
  workflowAction(created.id, "accounts_fd", { fdScore: 45 })
  workflowAction(created.id, "committee_approve")
  workflowAction(created.id, "hr_terms")
  const finalized = workflowAction(created.id, "director_approve")

  assert(finalized.status === "approved_director", "Director decision should finalize request")
  assert(finalized.timeline.length >= 8, "Timeline should capture lifecycle events")

  deleteRequest(created.id)
  assert(!requests.has(created.id), "Delete should remove request")

  console.log("Loan CRUD simulation passed:")
  console.log("- Create: PASS")
  console.log("- Read: PASS")
  console.log("- Update: PASS")
  console.log("- Workflow progression: PASS")
  console.log("- Delete: PASS")
}

runSimulation()
