import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn("⚠️  .env.local not found or failed to load. Checking .env...");
  dotenv.config(); // Fallback to .env
} else {
  console.log("✅ Loaded environment from .env.local");
}

console.log("🚀 Starting Turbo Monorepo Dev Server...");

// Spawn turbo
const turbo = spawn("turbo", ["run", "dev", "--concurrency=10"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    // Override Service URLs for local development (since .env.local uses Docker hostnames)
    TICKETS_SERVICE_URL: "http://localhost:3421",
    ATTENDANCE_SERVICE_URL: "http://localhost:3422",
    SITELOGS_SERVICE_URL: "http://localhost:3423",
    PM_SERVICE_URL: "http://localhost:3424",
    RBAC_SERVICE_URL: "http://localhost:3425",
    PROFILES_SERVICE_URL: "http://localhost:3426",
    UTILITY_SERVICE_URL: "http://localhost:3428",
    REDIS_URL: "redis://localhost:6379",
  }, // Explicitly pass loaded env vars with overrides
});

turbo.on("close", (code) => {
  process.exit(code || 0);
});
