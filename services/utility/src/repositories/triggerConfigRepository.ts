/**
 * Trigger Config Repository
 *
 * Handles CRUD for notification_trigger_configs table.
 */

import { query, queryOne } from "@jouleops/shared";

export interface TriggerConfig {
  id: string;
  trigger_key:
    | "punch_in"
    | "punch_out"
    | "complaint_open"
    | "complaint_inprogress"
    | "pm_inprogress"
    | "ticket_created"
    | "incident_created"
    | "incident_inprogress"
    | "incident_resolved";
  is_enabled: boolean;
  threshold_value: number;
  repeat_frequency_minutes: number | null;
  timezone: string;
}

/** Trigger keys that use minutes-from-midnight (time-based) */
const TIME_TRIGGER_KEYS = ["punch_in", "punch_out"] as const;

/** Trigger keys that use elapsed duration (duration-based) */
const DURATION_TRIGGER_KEYS = ["complaint_open", "complaint_inprogress", "pm_inprogress"] as const;

/** Trigger keys that are event-based (no threshold/frequency) */
const EVENT_TRIGGER_KEYS = ["ticket_created", "incident_created", "incident_inprogress", "incident_resolved"] as const;

export interface UpdateTriggerConfigInput {
  threshold_value?: number;
  repeat_frequency_minutes?: number;
  is_enabled?: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate update input against trigger-type rules.
 * Returns an array of validation errors (empty = valid).
 */
export function validateTriggerConfigUpdate(
  trigger_key: string,
  input: UpdateTriggerConfigInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.threshold_value !== undefined) {
    if (TIME_TRIGGER_KEYS.includes(trigger_key as any)) {
      // Time triggers: threshold is minutes from midnight, must be in [0, 1439]
      if (
        !Number.isInteger(input.threshold_value) ||
        input.threshold_value < 0 ||
        input.threshold_value > 1439
      ) {
        errors.push({
          field: "threshold_value",
          message:
            "threshold_value for time triggers must be an integer between 0 and 1439 (minutes from midnight)",
        });
      }
    } else if (DURATION_TRIGGER_KEYS.includes(trigger_key as any)) {
      // Duration triggers: threshold must be > 0
      if (!Number.isInteger(input.threshold_value) || input.threshold_value <= 0) {
        errors.push({
          field: "threshold_value",
          message: "threshold_value for duration triggers must be a positive integer",
        });
      }
    } else if (EVENT_TRIGGER_KEYS.includes(trigger_key as any)) {
      // Event triggers: threshold is typically ignored or 0
      if (!Number.isInteger(input.threshold_value)) {
        errors.push({
          field: "threshold_value",
          message: "threshold_value must be an integer",
        });
      }
    }
  }

  if (input.repeat_frequency_minutes !== undefined) {
    if (EVENT_TRIGGER_KEYS.includes(trigger_key as any)) {
       // repeat_frequency is usually null/ignored for event triggers
    } else if (
      !Number.isInteger(input.repeat_frequency_minutes) ||
      input.repeat_frequency_minutes <= 0
    ) {
      errors.push({
        field: "repeat_frequency_minutes",
        message: "repeat_frequency_minutes must be a positive integer",
      });
    }
  }

  return errors;
}

/**
 * Get all trigger configs
 */
export async function getAllTriggerConfigs(): Promise<TriggerConfig[]> {
  const sql = `
    SELECT id, trigger_key, is_enabled, threshold_value, repeat_frequency_minutes, timezone
    FROM notification_trigger_configs
    ORDER BY trigger_key
  `;
  return query<TriggerConfig>(sql);
}

/**
 * Update a trigger config by trigger_key.
 * Only updates fields that are present in the input.
 * Returns the updated config, or null if not found.
 */
export async function updateTriggerConfig(
  trigger_key: string,
  input: UpdateTriggerConfigInput,
): Promise<TriggerConfig | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.threshold_value !== undefined) {
    setClauses.push(`threshold_value = $${paramIndex++}`);
    values.push(input.threshold_value);
  }

  if (input.repeat_frequency_minutes !== undefined) {
    setClauses.push(`repeat_frequency_minutes = $${paramIndex++}`);
    values.push(input.repeat_frequency_minutes);
  }

  if (input.is_enabled !== undefined) {
    setClauses.push(`is_enabled = $${paramIndex++}`);
    values.push(input.is_enabled);
  }

  if (setClauses.length === 0) {
    // Nothing to update — fetch and return current config
    return queryOne<TriggerConfig>(
      `SELECT id, trigger_key, is_enabled, threshold_value, repeat_frequency_minutes, timezone
       FROM notification_trigger_configs
       WHERE trigger_key = $1`,
      [trigger_key],
    );
  }

  setClauses.push(`updated_at = now()`);
  values.push(trigger_key); // last param for WHERE clause

  const sql = `
    UPDATE notification_trigger_configs
    SET ${setClauses.join(", ")}
    WHERE trigger_key = $${paramIndex}
    RETURNING id, trigger_key, is_enabled, threshold_value, repeat_frequency_minutes, timezone
  `;

  return queryOne<TriggerConfig>(sql, values);
}

export default {
  getAllTriggerConfigs,
  updateTriggerConfig,
  validateTriggerConfigUpdate,
};
