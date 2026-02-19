import { Client } from "pg";

const RDS_URL =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function getLogId() {
  const client = new Client({ connectionString: RDS_URL });
  try {
    await client.connect();
    const res = await client.query("SELECT id FROM attendance_logs LIMIT 1");
    if (res.rows.length === 0) {
      console.log("No attendance logs found.");
      return;
    }
    console.log(`ID: ${res.rows[0].id}`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

getLogId();
