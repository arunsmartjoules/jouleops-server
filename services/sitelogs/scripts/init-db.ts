import { query } from "@jouleops/shared";

async function initDb() {
  console.log("Initializing log_master table...");
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS log_master (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_name TEXT NOT NULL,
        log_name TEXT NOT NULL,
        sequence_number INTEGER DEFAULT 0,
        log_id TEXT,
        dlr TEXT,
        dbr TEXT,
        nlt TEXT,
        nmt TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Check if unique constraint exists, if not add it
    // Using task_name + log_name as a unique pair for upserts
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'log_master_task_log_unique') THEN
          ALTER TABLE log_master ADD CONSTRAINT log_master_task_log_unique UNIQUE (task_name, log_name);
        END IF;
      END $$;
    `);

    console.log("log_master table initialized successfully.");
  } catch (error) {
    console.error("Error initializing log_master table:", error);
    process.exit(1);
  }
}

initDb();
