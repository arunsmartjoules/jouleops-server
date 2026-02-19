import { Client } from "pg";

const RDS_URL =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function testDelete() {
  const client = new Client({ connectionString: RDS_URL });
  try {
    await client.connect();

    // 1. Get a log ID
    const res = await client.query("SELECT id FROM attendance_logs LIMIT 1");
    if (res.rows.length === 0) {
      console.log("No attendance logs found.");
      return;
    }
    const id = res.rows[0].id;
    console.log(`Found ID: ${id}`);

    // 2. Try to delete via API (simulating gateway/service)
    // We'll use the service directly on port 3422 if possible, or bypass to see if it's a DB error
    console.log("Attempting manual DB delete first...");
    const delRes = await client.query(
      "DELETE FROM attendance_logs WHERE id = $1 RETURNING id",
      [id],
    );
    if (delRes.rows.length > 0) {
      console.log("✅ Manual DB delete successful.");
    } else {
      console.log("❌ Manual DB delete failed (no rows affected).");
    }
  } catch (err) {
    console.error("ERROR:", err.message);
    if (err.detail) console.log("Detail:", err.detail);
  } finally {
    await client.end();
  }
}

testDelete();
