const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.AMR_DB_URL) {
  console.error("AMR_DB_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.AMR_DB_URL });

async function run() {
  const res = await pool.query(`SELECT "hourlyConsumption" FROM "Reading" WHERE jsonb_typeof("hourlyConsumption") = 'array' LIMIT 1`);
  if (!res.rows[0]) {
    console.log("No reading with hourlyConsumption found.");
  } else {
    console.log("Raw hourly point:", res.rows[0].hourlyConsumption[0]);
  }
  await pool.end();
}
run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
