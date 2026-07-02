// Runs schema.sql, 002_advanced_features.sql, and 003_onboarding_and_witness.sql
// in order, using the pg driver directly — no psql CLI required.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const files = ["schema.sql", "002_advanced_features.sql", "003_onboarding_and_witness.sql"];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Check your .env file.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  console.log("Connected to database.");

  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping ${file} — not found at ${filePath}`);
      continue;
    }
    const sql = fs.readFileSync(filePath, "utf8");
    console.log(`Running ${file} ...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file} applied`);
    } catch (err) {
      console.error(`  ✗ ${file} failed:`, err.message);
      // Keep going — 002/003 use IF NOT EXISTS guards, so a rerun should be safe.
    }
  }

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
