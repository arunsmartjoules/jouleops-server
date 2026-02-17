/**
 * PostgreSQL Connection Pool
 *
 * Direct database access layer replacing Supabase SDK.
 * Uses a connection pool for efficient resource management.
 */

import { Pool } from "pg";
import type { PoolClient, QueryResult } from "pg";
import { logger } from "../utils/logger.ts";

// Build connection string from Supabase URL or use DATABASE_URL directly
const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Fallback: construct from Supabase URL
  // Supabase uses format: https://[project-ref].supabase.co
  // Database URL format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    if (process.env.NODE_ENV === "test") {
      return "postgresql://postgres:password@localhost:5432/postgres";
    }
    throw new Error("DATABASE_URL or SUPABASE_URL must be set");
  }

  // Extract project ref from Supabase URL
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    throw new Error("Invalid SUPABASE_URL format");
  }

  const projectRef = match[1];
  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD or DATABASE_URL must be set");
  }

  // Default to transaction pooler on port 6543
  return `postgresql://postgres.${projectRef}:${password}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
};

// Create connection pool with sensible defaults
const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: parseInt(process.env.DB_MAX_POOL_SIZE || "20"),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || "300000"), // 5 minutes
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || "120000"), // 2 minutes
  allowExitOnIdle: true,
  // SSL Configuration for production/external RDS
  ssl:
    process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: false, // Required for most hosted RDS providers like AWS/Railway unless CA cert is provided
        }
      : false,
  // Prevent TCP connection drops by intermediate firewalls/NAT
  keepAlive: true,
  keepAliveInitialDelayMillis: 3000, // 3 seconds (More aggressive for RDS)

  // Session variables
  statement_timeout: 300000, // 5 minutes
});

// Log pool errors
pool.on("error", (err) => {
  logger.error("Unexpected error on idle database client", { error: err });
});

// Log when pool creates a new connection (useful for debugging)
pool.on("connect", () => {
  logger.debug("New database connection established");
});

/**
 * Execute a SQL query and return all rows
 * @template T The expected row type
 * @param sql The SQL query string
 * @param params Optional array of query parameters
 * @returns {Promise<T[]>} Array of result rows
 */
export async function query<T = any>(
  sql: string,
  params?: any[],
): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(sql, params);
  const duration = Date.now() - start;

  // Log slow queries (> 100ms)
  if (duration > 100) {
    console.warn(`Slow query (${duration}ms):`, sql.substring(0, 100));
  }

  return result.rows as T[];
}

/**
 * Execute a SQL query and return the first row or null
 * @template T The expected row type
 * @param sql The SQL query string
 * @param params Optional array of query parameters
 * @returns {Promise<T | null>} The first row of the result or null if empty
 */
export async function queryOne<T = any>(
  sql: string,
  params?: any[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

/**
 * Execute a SQL query and return the raw result (includes rowCount, etc.)
 * @param sql The SQL query string
 * @param params Optional array of query parameters
 * @returns {Promise<QueryResult>} The raw pg query result
 */
export async function queryRaw(
  sql: string,
  params?: any[],
): Promise<QueryResult> {
  return pool.query(sql, params);
}

/**
 * Execute multiple queries in a transaction
 * @template T The return type of the transaction callback
 * @param fn Callback function that receives a PoolClient and returns a promise
 * @returns {Promise<T>} The result of the callback function
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a client from the pool for manual transaction management
 * @returns {Promise<PoolClient>} A pg PoolClient
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * Health check for database connectivity
 * @returns {Promise<{connected: boolean, latency: number, error?: string}>}
 */
export async function healthCheck(): Promise<{
  connected: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await pool.query("SELECT 1");
    return {
      connected: true,
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      connected: false,
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Gracefully close the pool (call on shutdown)
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

// Export pool for advanced use cases
export { pool };

export default {
  query,
  queryOne,
  queryRaw,
  transaction,
  getClient,
  healthCheck,
  closePool,
  pool,
};
