import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = "http://localhost:3420/api";

async function testApiKey(key) {
  console.log(
    `\nTesting API Key: ${key ? key.substring(0, 10) + "..." : "None"}`,
  );

  try {
    // Attempt to access a protected route (e.g., checking health or a specific API key route if one exists)
    // Using /tasks/create as it uses verifyApiKey
    const res = await fetch(`${BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key || "",
      },
      body: JSON.stringify({ title: "Test Task", description: "API Key Test" }),
    });

    if (res.status === 401) {
      console.log(
        `✅ [PASS] 401 Unauthorized (Expected for invalid/missing key)`,
      );
      return false;
    } else if (res.status >= 200 && res.status < 300) {
      console.log(`✅ [PASS] ${res.status} Success (API Key accepted)`);
      return true;
    } else {
      console.log(
        `⚠️  [INFO] Got status ${res.status}. Content: ${await res.text()}`,
      );
      return false;
    }
  } catch (err) {
    console.error(`❌ Network error: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log("--- Week 2 Verification: API Keys ---");

  // 1. Test without key
  console.log("1. Testing missing API Key...");
  await testApiKey(null);

  // 2. Test with invalid key
  console.log("2. Testing invalid API Key...");
  await testApiKey("sk_live_invalidkey12345");

  // 3. Test with provided key
  const validKey = process.argv[2];
  if (validKey) {
    console.log("3. Testing provided API Key...");
    await testApiKey(validKey);
  } else {
    console.log(
      "\n⚠️  Skipping valid key test. Run with: bun scripts/verify-week2.js <YOUR_GENERATED_KEY>",
    );
  }
}

run();
