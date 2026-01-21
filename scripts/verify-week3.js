import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Dynamic imports to test service logic
// Note: We can't import services directly easily if they depend on relative paths or envs not set,
// so we'll test the DB effects or mock the calls.
// Better: We will simulate the actions the services perform or call them if possible.
// Since this is a script, we might have issues with imports.
// Let's try to verify via DB checks primarily.

async function verifyVerificationCodesTable() {
  console.log("\n1. Verifying 'verification_codes' table...");
  const { error } = await supabase
    .from("verification_codes")
    .select("count")
    .limit(1)
    .single();

  if (error) {
    if (
      error.message.includes('relation "verification_codes" does not exist')
    ) {
      console.error(
        "❌ Table 'verification_codes' does not exist. Run migration!",
      );
      return false;
    }
    console.error("❌ Error accessing table:", error.message);
    return false;
  }
  console.log("✅ Table 'verification_codes' exists.");
  return true;
}

async function verifySchedulerCleanup() {
  console.log("\n2. Verifying Scheduler Cleanup...");
  const fs = await import("fs");
  if (fs.existsSync("src/utils/scheduler.js")) {
    console.error(
      "❌ 'src/utils/scheduler.js' still exists. It should have been deleted.",
    );
    return false;
  }
  console.log("✅ 'src/utils/scheduler.js' is deleted.");
  return true;
}

// Verification of Delete Logic
// Since we changed the code to actually call supabase.delete(), we can verify by inspection
// or by trying to run a snippet if we can import the service.
async function verifyDeleteLogic() {
  console.log("\n3. Verifying Delete Services Code...");
  const fs = await import("fs");
  try {
    const sitesService = await fs.promises.readFile(
      "src/services/sitesService.js",
      "utf8",
    );
    if (
      sitesService.includes(".delete()") &&
      sitesService.includes('.eq("site_id", siteId)')
    ) {
      console.log("✅ sitesService.deleteSite implementation looks correct.");
    } else {
      console.error(
        "❌ sitesService.deleteSite implementation looks suspicious.",
      );
    }

    const usersService = await fs.promises.readFile(
      "src/services/usersService.js",
      "utf8",
    );
    if (
      usersService.includes(".delete()") &&
      usersService.includes('.eq("user_id", userId)')
    ) {
      console.log("✅ usersService.deleteUser implementation looks correct.");
    } else {
      console.error(
        "❌ usersService.deleteUser implementation looks suspicious.",
      );
    }
    return true;
  } catch (err) {
    console.error("❌ Error reading service files:", err.message);
    return false;
  }
}

async function run() {
  console.log("--- Week 3 Verification ---");
  const tableExists = await verifyVerificationCodesTable();
  if (!tableExists) {
    console.log("⚠️  Skipping further tests until migration is run.");
    return;
  }

  await verifySchedulerCleanup();
  await verifyDeleteLogic();
  console.log("\n--- Verification Complete ---");
}

run();
