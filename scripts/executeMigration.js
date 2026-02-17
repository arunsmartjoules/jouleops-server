const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString =
  "postgresql://sjpl_ops_orgs:$Dejoule%402026@staging-pd-database.csyvasyhgbhu.ap-south-1.rds.amazonaws.com:5432/joule_ops";

async function runMigration() {
  const sqlPath = path.join(__dirname, "migrate_site_code.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    console.log("Executing migration script...");
    await client.query(sql);
    console.log("Migration successful!");

    await client.end();
  } catch (err) {
    console.error("Migration failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runMigration();
