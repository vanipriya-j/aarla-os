#!/usr/bin/env node
/**
 * Concatenate supabase/migrations/*.sql → supabase/aarla-os-complete.sql
 * Single artifact for the final clean setup after PR 8.
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(process.cwd(), "supabase/migrations");
const names = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const header = `-- =============================================================================
-- Aarla OS — COMPLETE SCHEMA (single file for clean setup)
-- =============================================================================
-- Auto-generated from supabase/migrations/*.sql (${names.length} files).
-- Regenerate: node scripts/generate-complete-schema.js
--
-- Covers foundation + daily-ops / build-set migrations through the current branch
-- (Abandoned Carts, Inventory, Weekly Board, Shopify Reserve, GST, Campaigns,
-- and later PR 7–8 objects as those migrations land).
--
-- AFTER PR 8 IS MERGED — one clean initialization:
--   Option A: Vercel /setup with "Load demo data" UNCHECKED
--   Option B: Run this file once in Supabase SQL Editor on an empty DB
--
-- Do not load demo seed against live commerce data.
-- =============================================================================

`;

let body = "";
for (const name of names) {
  const sql = fs.readFileSync(path.join(dir, name), "utf8").trimEnd();
  body += `\n-- ---------------------------------------------------------------------------\n-- SOURCE: ${name}\n-- ---------------------------------------------------------------------------\n\n${sql}\n`;
}

const outPath = path.join(process.cwd(), "supabase/aarla-os-complete.sql");
fs.writeFileSync(outPath, header + body + "\n");
console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${names.length} migrations)`);
