import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateApiKey(name, scopes = []) {
  // 1. Generate a random 32-byte key
  const rawKey = "sk_live_" + crypto.randomBytes(24).toString("hex");

  // 2. Hash it
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  console.log(`\nGenerating API Key for "${name}"...`);
  console.log(`Scopes: ${scopes.length ? scopes.join(", ") : "None"}`);

  // 3. Insert into DB
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      id: uuidv4(),
      key_hash: keyHash,
      prefix: rawKey.substring(0, 15),
      name: name,
      scopes: scopes,
      created_at: new Date(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Failed to insert API key:", error.message);
    if (error.message.includes('relation "api_keys" does not exist')) {
      console.error(
        "   HINT: Did you run the migration 'migrations/20240121_week2_auth.sql'?",
      );
    }
    return;
  }

  console.log("✅ API Key Created Successfully!");
  console.log("---------------------------------------------------");
  console.log("Key:   ", rawKey);
  console.log("---------------------------------------------------");
  console.log("⚠️  SAVE THIS KEY NOW. You strictly cannot see it again.");
  console.log("ID:    ", data.id);
  console.log("Name:  ", data.name);
}

// Simple CLI args parser
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log(
    "Usage: bun scripts/generate-api-key.js <name> [scope1] [scope2] ...",
  );
  console.log(
    "Example: bun scripts/generate-api-key.js 'n8n-integration' 'sites:write' 'assets:read'",
  );
  process.exit(0);
}

const name = args[0];
const scopes = args.slice(1);

generateApiKey(name, scopes);
