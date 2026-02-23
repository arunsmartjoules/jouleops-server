/**
 * Activity Logger
 *
 * Shared utility for writing to the activity_logs table.
 * Failures are swallowed so logging never breaks the main request flow.
 */

import { queryOne } from "../lib/db.ts";

export interface LogActivityInput {
  user_id?: string | null;
  action: string;
  module: string;
  description?: string;
  ip_address?: string;
  device_info?: string;
  metadata?: Record<string, any>;
}

export async function logActivity(data: LogActivityInput): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO activity_logs (user_id, action, module, description, ip_address, device_info, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.user_id || null,
        data.action,
        data.module,
        data.description || null,
        data.ip_address || null,
        data.device_info || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
