const { Client } = require("pg");

// Single $ for bun/node string literal
const connectionString =
  "postgresql://sjpl_ops_orgs:$Dejoule%402026@staging-pd-database.csyvasyhgbhu.ap-south-1.rds.amazonaws.com:5432/joule_ops";

async function testConnection() {
  console.log("Testing RDS connection with SSL bypass...");
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    console.log("Connection Successful!");
    const res = await client.query(`
      SELECT id, user_id FROM attendance_logs 
      WHERE check_out_time IS NULL 
      LIMIT 1
    `);
    console.log("\n--- ACTIVE ATTENDANCE ---");
    if (res.rows.length > 0) {
      console.log(`Attendance ID: ${res.rows[0].id}`);
      console.log(`User ID: ${res.rows[0].user_id}`);
    } else {
      console.log("No active attendance records found.");
    }
    console.log("------------------------\n");

    await client.end();
  } catch (err) {
    console.error("Connection Failed:", err.message);
    process.exit(1);
  }
}

testConnection();
