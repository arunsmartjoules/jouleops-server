/**
 * Notification Template Repository
 *
 * Handles CRUD for notification_templates table.
 */

import { query, queryOne } from "@jouleops/shared";

export interface NotificationTemplate {
  id: string;
  trigger_key: string;
  template_name: string;
  title_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  trigger_key: string;
  template_name: string;
  title_template: string;
  body_template: string;
  is_active?: boolean;
}

export interface UpdateTemplateInput {
  trigger_key?: string;
  template_name?: string;
  title_template?: string;
  body_template?: string;
  is_active?: boolean;
}

const VALID_TRIGGER_KEYS = [
  "punch_in",
  "punch_out",
  "complaint_open",
  "complaint_inprogress",
  "pm_inprogress",
  "ticket_created",
  "incident_created",
  "incident_inprogress",
  "incident_resolved",
] as const;

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate create input for a notification template.
 * Returns an array of validation errors (empty = valid).
 */
export function validateCreateTemplateInput(input: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!input.title_template || input.title_template.trim() === "") {
    errors.push({ field: "title_template", message: "title_template must not be empty" });
  }

  if (!input.body_template || input.body_template.trim() === "") {
    errors.push({ field: "body_template", message: "body_template must not be empty" });
  }

  if (!input.trigger_key || !VALID_TRIGGER_KEYS.includes(input.trigger_key as any)) {
    errors.push({
      field: "trigger_key",
      message: `trigger_key must be one of: ${VALID_TRIGGER_KEYS.join(", ")}`,
    });
  }

  return errors;
}

/**
 * Get all notification templates
 */
export async function getAllTemplates(): Promise<NotificationTemplate[]> {
  const sql = `
    SELECT id, trigger_key, template_name, title_template, body_template, is_active, created_at, updated_at
    FROM notification_templates
    ORDER BY created_at DESC
  `;
  return query<NotificationTemplate>(sql);
}

/**
 * Create a new notification template.
 * Returns the created template.
 */
export async function createTemplate(input: CreateTemplateInput): Promise<NotificationTemplate> {
  const sql = `
    INSERT INTO notification_templates (trigger_key, template_name, title_template, body_template, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, trigger_key, template_name, title_template, body_template, is_active, created_at, updated_at
  `;
  const result = await queryOne<NotificationTemplate>(sql, [
    input.trigger_key,
    input.template_name,
    input.title_template,
    input.body_template,
    input.is_active ?? true,
  ]);
  return result!;
}

/**
 * Update a notification template by id.
 * Only updates fields present in the input.
 * Returns the updated template, or null if not found.
 */
export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<NotificationTemplate | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.trigger_key !== undefined) {
    setClauses.push(`trigger_key = $${paramIndex++}`);
    values.push(input.trigger_key);
  }

  if (input.template_name !== undefined) {
    setClauses.push(`template_name = $${paramIndex++}`);
    values.push(input.template_name);
  }

  if (input.title_template !== undefined) {
    setClauses.push(`title_template = $${paramIndex++}`);
    values.push(input.title_template);
  }

  if (input.body_template !== undefined) {
    setClauses.push(`body_template = $${paramIndex++}`);
    values.push(input.body_template);
  }

  if (input.is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(input.is_active);
  }

  if (setClauses.length === 0) {
    // Nothing to update — fetch and return current template
    return queryOne<NotificationTemplate>(
      `SELECT id, trigger_key, template_name, title_template, body_template, is_active, created_at, updated_at
       FROM notification_templates
       WHERE id = $1`,
      [id],
    );
  }

  setClauses.push(`updated_at = now()`);
  values.push(id); // last param for WHERE clause

  const sql = `
    UPDATE notification_templates
    SET ${setClauses.join(", ")}
    WHERE id = $${paramIndex}
    RETURNING id, trigger_key, template_name, title_template, body_template, is_active, created_at, updated_at
  `;

  return queryOne<NotificationTemplate>(sql, values);
}

/**
 * Delete a notification template by id.
 * Returns true if deleted, false if not found.
 */
export async function deleteTemplate(id: string): Promise<boolean> {
  const sql = `
    DELETE FROM notification_templates
    WHERE id = $1
    RETURNING id
  `;
  const result = await queryOne<{ id: string }>(sql, [id]);
  return result !== null;
}

export default {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  validateCreateTemplateInput,
};
