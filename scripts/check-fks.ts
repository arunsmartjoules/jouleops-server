import { Client } from "pg";

const RDS_URL =
  "postgresql://sjpl_ops_orgs:%24Dejoule%402026@staging-pd-database.cf6kpkskckf8.us-west-2.rds.amazonaws.com:5432/joule_ops";

async function checkFKs() {
  const client = new Client({ connectionString: RDS_URL });
  try {
    await client.connect();
    console.log("--- Tables referencing sites (site_code) ---");
    const res = await client.query(`
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                a.attname AS column_name,
                confrelid::regclass AS referenced_table,
                af.attname AS referenced_column
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
            WHERE confrelid = 'sites'::regclass;
        `);
    console.table(res.rows);

    console.log("\n--- Tables referencing users (user_id) ---");
    const res2 = await client.query(`
            SELECT
                conname AS constraint_name,
                conrelid::regclass AS table_name,
                a.attname AS column_name,
                confrelid::regclass AS referenced_table,
                af.attname AS referenced_column
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
            WHERE confrelid = 'users'::regclass;
        `);
    console.table(res2.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkFKs();
