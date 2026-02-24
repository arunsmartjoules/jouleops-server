import { Client } from "pg";
import fs from "fs";

const connectionString =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const sql = fs.readFileSync(
    "/Users/arunkumaranandhan/.gemini/antigravity/brain/cb3b444a-f38f-4da6-8d30-27bbd69ce36d/whatsapp_overhaul.sql",
    "utf8",
  );
  console.log("Running SQL...");
  try {
    await client.query(sql);
    console.log("Successfully applied migration");
  } catch (e) {
    console.error("Error applying migration:", e);
  } finally {
    await client.end();
  }
}

run();
