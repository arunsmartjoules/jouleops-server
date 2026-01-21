import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = "http://localhost:3420/api";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing from environment variables.");
  process.exit(1);
}

// Helper to generate token locally
function generateToken(role, userId = "123e4567-e89b-12d3-a456-426614174000") {
  return jwt.sign(
    {
      user_id: userId,
      role: role,
      email: `test-${role}@example.com`,
      is_superadmin: role === "superadmin",
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function testRoute(name, method, url, token, expectedStatus) {
  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: method !== "GET" ? JSON.stringify({ dummy: "data" }) : undefined,
    });

    if (res.status === expectedStatus) {
      console.log(`✅ [PASS] ${name}: Got ${res.status} as expected`);
    } else if (expectedStatus === "2xx" && res.ok) {
      console.log(
        `✅ [PASS] ${name}: Got ${res.status} (2xx range) as expected`,
      );
    } else {
      console.log(
        `❌ [FAIL] ${name}: Expected ${expectedStatus}, got ${res.status} (Response: ${res.statusText})`,
      );
    }
  } catch (err) {
    console.log(`❌ [FAIL] ${name}: Network error - ${err.message}`);
  }
}

async function runTests() {
  console.log("Starting Authorization Tests (Local Token Generation)...");

  try {
    const adminToken = generateToken("admin");
    const staffToken = generateToken("technician");

    console.log("\n--- Admin Tests ---");
    // Test 1: Admin create site (Protected)
    // Expect 400 (Bad Request) because body is invalid, but Auth should pass.
    // If Auth fails, it would be 403 or 401.
    await testRoute("Admin Create Site", "POST", "/sites", adminToken, 400);

    // Test 2: Admin list sites (Read - usually open or protected, check routes)
    // Assuming GET is open or allowed for admin
    await testRoute("Admin Get Sites", "GET", "/sites", adminToken, 200);

    console.log("\n--- Technician/Staff Tests ---");
    // Test 3: Technician create site (Should be Forbidden)
    await testRoute(
      "Technician Create Site",
      "POST",
      "/sites",
      staffToken,
      403,
    );

    // Test 4: Technician delete asset (Should be Forbidden)
    await testRoute(
      "Technician Delete Asset",
      "DELETE",
      "/assets/123-dummy-id",
      staffToken,
      403,
    );

    console.log("\n--- Tests Completed ---");
  } catch (err) {
    console.error("Test execution failed:", err.message);
  }
}

runTests();
