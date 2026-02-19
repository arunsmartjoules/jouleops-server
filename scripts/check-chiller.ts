import { Client } from "pg";

const RDS_URL =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function checkChillerTable() {
  const client = new Client({ connectionString: RDS_URL });
  try {
    await client.connect();
    const res = await client.query(`
            SELECT column_name, data_type, column_default, is_identity
            FROM information_schema.columns 
            WHERE table_name = 'chiller_readings'
            ORDER BY ordinal_position;
        `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkChillerTable();
