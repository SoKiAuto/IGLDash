import "dotenv/config"

import { Pool } from "pg"

// Fixed list — the identifiers below are never taken from user input.
const TABLES = [
  "GeographicalArea",
  "Customer",
  "Device",
  "Reading",
  "Alarm",
  "SystemSettings",
  "RejectedConnectionAttempt",
]

async function main() {
  const connectionString = process.env.AMR_DB_URL
  if (!connectionString) {
    throw new Error("AMR_DB_URL is not set")
  }

  const pool = new Pool({ connectionString, max: 1 })

  try {
    const db = await pool.query("SELECT current_database() AS name")
    console.log(`AMR database "${db.rows[0].name}"`)

    for (const table of TABLES) {
      const quoted = `"${table}"`
      const present = await pool.query("SELECT to_regclass($1) AS reg", [`public.${quoted}`])
      if (!present.rows[0].reg) {
        console.log(`${table.padEnd(27)} missing`)
        continue
      }
      const count = await pool.query(`SELECT count(*)::int AS count FROM public.${quoted}`)
      console.log(`${table.padEnd(27)} ${count.rows[0].count}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
