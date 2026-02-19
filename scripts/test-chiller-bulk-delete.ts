import { apiFetch, safeJsonParse } from "../admin/src/lib/api";

// This is a browser-like environment test or a script that needs to be run in a context with access to the API
// Since I can't easily run it with admin/lib/api imports here, I'll use a direct fetch script for the backend.

const BACKEND_URL = "http://localhost:3423"; // sitelogs service
const INTERNAL_API_KEY = "5f4eef33-5c8e-4a62-8e1e-9e7f8e8e8e8e"; // from env

async function testBulkDelete() {
  // 1. Get some IDs first
  const res = await fetch(`${BACKEND_URL}/api/chiller-readings?limit=2`, {
    headers: { "x-api-key": INTERNAL_API_KEY },
  });
  const data = await res.json();

  if (!data.success || !data.data || data.data.length === 0) {
    console.log("No chiller readings to test with.");
    return;
  }

  const ids = data.data.map((r: any) => r.id);
  console.log("Attempting to delete IDs:", ids);

  // 2. Test bulk delete
  const delRes = await fetch(
    `${BACKEND_URL}/api/chiller-readings/bulk-delete`,
    {
      method: "POST",
      headers: {
        "x-api-key": INTERNAL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    },
  );

  const delResult = await delRes.json();
  console.log("Bulk delete result:", delResult);
}

testBulkDelete();
