/**
 * Simulate add fleet vehicle + nonregional request, verify, then DELETE (revert).
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = resolve(root, ".env.local")
const envText = readFileSync(envPath, "utf8")
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[m[1]]) process.env[m[1]] = v
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const h = { ...headers }
  if (prefer) h.Prefer = prefer
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { ok: res.ok, status: res.status, json, text }
}

const stamp = Date.now()
const plate = `SIM-REV-${stamp}`.slice(0, 20).toUpperCase()
const note = `SIM-TEST-REVERT ${new Date().toISOString()}`

console.log("=== SIM START ===")
console.log({ plate, note })

// Find actor (IT user) — omit hod_id (migration 106/107 may not be applied live)
let users = await rest(
  `user_profiles?select=id,role,email,first_name,last_name,department_id,signature_data_url,region_id&or=(first_name.ilike.*Kwaku*,email.ilike.*ohemeng*)&limit=5`,
)
if (!users.ok) {
  users = await rest(
    `user_profiles?select=id,role,email,first_name,last_name,signature_data_url&first_name=ilike.*Kwaku*&limit=5`,
  )
}
console.log("users_status", users.status)
if (!users.ok) {
  console.error("user lookup failed", users.text)
  process.exit(1)
}
const actor = (users.json || [])[0]
if (!actor) {
  console.error("No actor user found")
  process.exit(1)
}
actor.hod_id = actor.hod_id ?? null
console.log("actor", {
  id: actor.id,
  role: actor.role,
  name: `${actor.first_name} ${actor.last_name}`,
  email: actor.email,
  hod_id: actor.hod_id,
})

// 1) Insert vehicle
const vehiclePayload = {
  registration_number: plate,
  make: "TOYOTA",
  model: "HILUX-SIM",
  capacity: 5,
  vehicle_type: "pickup",
  assigned_region_id: actor.region_id ?? null,
  status: "available",
  notes: note,
  created_by: actor.id,
}

const vehIns = await rest("transport_vehicles", { method: "POST", body: vehiclePayload })
console.log("vehicle_insert", vehIns.status, JSON.stringify(vehIns.json)?.slice(0, 500))
if (!vehIns.ok) {
  console.error("Vehicle insert failed — aborting nonregional still try? continuing cleanup only if partial")
}

const vehicleId = Array.isArray(vehIns.json) ? vehIns.json[0]?.id : vehIns.json?.id
console.log("vehicleId", vehicleId)

// Verify vehicle
if (vehicleId) {
  const vehGet = await rest(`transport_vehicles?id=eq.${vehicleId}&select=*`)
  console.log("vehicle_verify", vehGet.status, (vehGet.json || [])[0]?.registration_number)
}

// 2) Insert nonregional requisition
const requiredAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
const selfAuthRoles = new Set([
  "department_head",
  "hod",
  "admin",
  "it-admin",
  "it_admin",
  "hr_executive",
  "hr_executive_officer",
  "manager_hr",
  "director_hr",
])
const role = String(actor.role || "").toLowerCase()
const selfAuth = selfAuthRoles.has(role) || role.includes("admin")

const baseReq = {
  requester_id: actor.id,
  department: "IT",
  location: "QCC Head Office",
  origin: "QCC Head Office",
  destination: "SIM TEST DESTINATION — REVERT",
  purpose: note,
  required_at: requiredAt,
  return_at: null,
  persons_requiring_transport: "1 — SIM TEST REVERT",
  supporting_documents: [],
  md_decision: "pending",
}

let reqPayload
if (selfAuth) {
  const sig = actor.signature_data_url || "data:image/png;base64,iVBORw0KGgo="
  const authName = `${actor.first_name || ""} ${actor.last_name || ""}`.trim().toUpperCase() || "SIM AUTH"
  reqPayload = {
    ...baseReq,
    hod_authorization: `${authName} — SIM SELF-AUTH REVERT`,
    hod_signature_data_url: sig,
    department_head_signer_id: actor.id,
    department_head_signed_at: new Date().toISOString(),
    department_head_signature_data_url: sig,
    hod_id: actor.id,
    hod_decision: "approved",
    hod_decided_by: actor.id,
    hod_decided_at: new Date().toISOString(),
    status: "awaiting_md_approval",
    requester_signature_data_url: sig,
    requester_signed_at: new Date().toISOString(),
  }
} else {
  reqPayload = {
    ...baseReq,
    hod_authorization: null,
    hod_signature_data_url: null,
    hod_id: actor.hod_id || null,
    hod_decision: "pending",
    status: "awaiting_hod_approval",
    requester_signature_data_url: actor.signature_data_url || null,
    requester_signed_at: new Date().toISOString(),
  }
}

let nrIns = await rest("nonregional_transport_requisitions", { method: "POST", body: reqPayload })
console.log("nonregional_insert_full", nrIns.status, String(nrIns.text).slice(0, 600))

// Fallback: strip migration-107 columns if missing
if (!nrIns.ok && /column|schema cache|does not exist/i.test(String(nrIns.text))) {
  const stripped = {
    requester_id: actor.id,
    department: "IT",
    location: "QCC Head Office",
    origin: "QCC Head Office",
    destination: "SIM TEST DESTINATION — REVERT",
    purpose: note,
    required_at: requiredAt,
    persons_requiring_transport: "1 — SIM TEST REVERT",
    hod_authorization: selfAuth
      ? `${`${actor.first_name || ""} ${actor.last_name || ""}`.trim().toUpperCase()} — SIM`
      : "PENDING HOD",
    hod_signature_data_url: actor.signature_data_url || "data:image/png;base64,iVBORw0KGgo=",
    supporting_documents: [],
    status: selfAuth ? "awaiting_md_approval" : "pending",
  }
  nrIns = await rest("nonregional_transport_requisitions", { method: "POST", body: stripped })
  console.log("nonregional_insert_stripped", nrIns.status, String(nrIns.text).slice(0, 600))
}

const reqId = Array.isArray(nrIns.json) ? nrIns.json[0]?.id : nrIns.json?.id
console.log("requestId", reqId, "status", Array.isArray(nrIns.json) ? nrIns.json[0]?.status : nrIns.json?.status)

if (reqId) {
  const nrGet = await rest(`nonregional_transport_requisitions?id=eq.${reqId}&select=id,status,purpose,destination`)
  console.log("nonregional_verify", nrGet.status, JSON.stringify(nrGet.json))
}

// === REVERT ===
console.log("=== REVERT ===")
const results = { vehicleDeleted: false, requestDeleted: false }

if (reqId) {
  const delR = await rest(`nonregional_transport_requisitions?id=eq.${reqId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  })
  console.log("delete_request", delR.status, delR.text?.slice?.(0, 200) || delR.text)
  results.requestDeleted = delR.ok || delR.status === 204
  const checkR = await rest(`nonregional_transport_requisitions?id=eq.${reqId}&select=id`)
  console.log("request_gone", checkR.status, JSON.stringify(checkR.json))
  results.requestDeleted = results.requestDeleted && Array.isArray(checkR.json) && checkR.json.length === 0
}

if (vehicleId) {
  const delV = await rest(`transport_vehicles?id=eq.${vehicleId}`, {
    method: "DELETE",
    prefer: "return=minimal",
  })
  console.log("delete_vehicle", delV.status, delV.text?.slice?.(0, 200) || delV.text)
  results.vehicleDeleted = delV.ok || delV.status === 204
  const checkV = await rest(`transport_vehicles?id=eq.${vehicleId}&select=id`)
  console.log("vehicle_gone", checkV.status, JSON.stringify(checkV.json))
  results.vehicleDeleted = results.vehicleDeleted && Array.isArray(checkV.json) && checkV.json.length === 0
}

// Also cleanup by note marker if ids missing
if (!vehicleId) {
  const delByPlate = await rest(`transport_vehicles?registration_number=eq.${encodeURIComponent(plate)}`, {
    method: "DELETE",
    prefer: "return=representation",
  })
  console.log("delete_vehicle_by_plate", delByPlate.status, JSON.stringify(delByPlate.json)?.slice(0, 200))
}
if (!reqId) {
  const delByPurpose = await rest(`nonregional_transport_requisitions?purpose=eq.${encodeURIComponent(note)}`, {
    method: "DELETE",
    prefer: "return=representation",
  })
  console.log("delete_request_by_purpose", delByPurpose.status, JSON.stringify(delByPurpose.json)?.slice(0, 200))
}

console.log("=== SIM SUMMARY ===")
console.log(
  JSON.stringify(
    {
      actor: actor.email || actor.id,
      role: actor.role,
      plate,
      vehicleId: vehicleId || null,
      vehicleInsertOk: Boolean(vehicleId),
      requestId: reqId || null,
      requestInsertOk: Boolean(reqId),
      selfAuthPath: selfAuth,
      reverted: results,
    },
    null,
    2,
  ),
)
