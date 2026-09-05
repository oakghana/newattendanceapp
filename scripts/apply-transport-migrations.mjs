import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"

const { Client } = pg
const root = resolve(process.cwd())
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
  if (!match) continue
  process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "")
}
const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const file of [
  "105_vehicle_inventory_and_shift_scheduling.sql",
  "106_regional_chief_driver_dispatch.sql",
  "107_nonregional_requester_hod_approval.sql",
]) {
  const sql = readFileSync(resolve(root, "supabase", "migrations", file), "utf8")
  console.log(`Applying ${file}...`)
  await client.query(sql)
  console.log(`Applied ${file}`)
}
await client.end()
