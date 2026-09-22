#!/usr/bin/env node
/**
 * Creates local env files from examples when missing.
 * Never overwrites existing files. Does not invent real third-party secrets.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const infraDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(infraDir, "..");

const copies = [
  {
    from: path.join(infraDir, ".env.example"),
    to: path.join(infraDir, ".env"),
    label: "infra/.env"
  },
  {
    from: path.join(infraDir, "meta.secrets.env.example"),
    to: path.join(infraDir, "meta.secrets.env"),
    label: "infra/meta.secrets.env"
  },
  {
    from: path.join(rootDir, "frontend", ".env.example"),
    to: path.join(rootDir, "frontend", ".env"),
    label: "frontend/.env"
  }
];

let created = 0;
let skipped = 0;

for (const item of copies) {
  if (!fs.existsSync(item.from)) {
    console.error(`Missing example file: ${item.from}`);
    process.exit(1);
  }
  if (fs.existsSync(item.to)) {
    console.log(`skip  ${item.label} (already exists)`);
    skipped += 1;
    continue;
  }
  fs.copyFileSync(item.from, item.to);
  console.log(`create ${item.label}`);
  created += 1;
}

console.log(`\nDone. created=${created} skipped=${skipped}`);
console.log("Optional: fill WhatsApp/Telegram/Meta keys in infra/.env and infra/meta.secrets.env.");
console.log("Local CRM works without those integrations.");
