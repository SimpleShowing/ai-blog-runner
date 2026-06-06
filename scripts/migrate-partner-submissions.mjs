#!/usr/bin/env node
/**
 * One-time migration: create the partner_submissions table.
 * Run with: node scripts/migrate-partner-submissions.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, "../drizzle/0003_shocking_obadiah_stane.sql"),
  "utf8"
);

const conn = await createConnection({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});
try {
  console.log("Applying migration: create partner_submissions table...");
  await conn.execute(sql);
  console.log("✓ Migration applied successfully.");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("Table already exists — skipping.");
  } else {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
