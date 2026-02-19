import { Client } from "pg";

const RDS_URL =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function checkAttendanceSchema() {
  const client = new Client({ connectionString: RDS_URL });
  try {
    await client.connect();
    console.log("--- Columns in attendance_logs ---");
    const res = await client.query(`
            SELECT column_name, data_type, column_default, is_identity
            FROM information_schema.columns
            WHERE table_name = 'attendance_logs' AND table_schema = 'public'
        `);
    console.table(res.rows);

    console.log("\n--- Constraints (PK/FK) ---");
    const conRes = await client.query(`
            SELECT conname, contype, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'attendance_logs'::regclass
        `);
    console.table(conRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkAttendanceSchema();
