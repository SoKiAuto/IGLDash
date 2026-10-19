import "dotenv/config"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Pool } from "pg"

const schemaFile = resolve(process.cwd(), "db", "amr", "schema.sql")

async function main() {
  const connectionString = process.env.AMR_DB_URL
  if (!connectionString) {
    throw new Error("AMR_DB_URL is not set")
  }
  if (connectionString === process.env.DATABASE_URL) {
    throw new Error("AMR_DB_URL is the same as DATABASE_URL — create a separate AMR database first")
  }

  const sql = readFileSync(schemaFile, "utf8")
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()

  let database = ""
  try {
    await client.query("BEGIN")
    await client.query(sql)
    const applied = await client.query("SELECT current_database() AS name")
    database = applied.rows[0].name
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`AMR schema applied to database "${database}".`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
