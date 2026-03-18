/**
 * Notification Filters
 *
 * Pure utility functions for filtering and transforming notification dispatch
 * data. No DB calls — callers are responsible for fetching data and passing
 * it in. This keeps the logic fully testable.
 */

// ---------------------------------------------------------------------------
// Task 6.12: Exclusion list filter
// Requirements: 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------

/**
 * Filter out excluded users from a list of user IDs.
 *
 * Returns only user IDs NOT present in `excludedUserIds`.
 * Pure function — no DB calls.
 *
 * @param userIds         - Candidate user IDs to dispatch to.
 * @param excludedUserIds - User IDs that must be excluded from dispatch.
 * @returns User IDs that are not in the exclusion list.
 */
export function filterExcludedUsers(
  userIds: string[],
  excludedUserIds: string[],
): string[] {
  const exclusionSet = new Set(excludedUserIds);
  return userIds.filter((id) => !exclusionSet.has(id));
}

// ---------------------------------------------------------------------------
// Task 6.14: {{variable}} placeholder resolver
// Requirements: 9.5
// ---------------------------------------------------------------------------

/**
 * Resolve `{{variable}}` placeholders in a template string.
 *
 * - Replaces every `{{key}}` with `context[key]`.
 * - If a key is not in context, the placeholder is left as-is.
 * - Handles multiple occurrences of the same placeholder.
 *
 * @param template - Template string containing `{{key}}` tokens.
 * @param context  - Map of variable names to replacement values.
 * @returns The template with all resolvable placeholders substituted.
 */
export function resolvePlaceholders(
  template: string,
  context: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(context, key)
      ? context[key]
      : match;
  });
}

// ---------------------------------------------------------------------------
// Task 6.16: Inactive-template guard
// Requirements: 3.5, 4.5, 9.8
// ---------------------------------------------------------------------------

export interface NotificationTemplate {
  id: string;
  trigger_key: string;
  is_active: boolean;
  title_template: string;
  body_template: string;
}

export interface SuppressedResult {
  suppressed: true;
  reason: "inactive_template" | "missing_template";
}

export interface ActiveResult {
  suppressed: false;
  template: NotificationTemplate;
}

/**
 * Return the active template for a given trigger key, or a suppressed result
 * if the template is missing or inactive.
 *
 * - No template for the trigger key → `{ suppressed: true, reason: 'missing_template' }`
 * - Template exists but `is_active` is false → `{ suppressed: true, reason: 'inactive_template' }`
 * - Template exists and is active → `{ suppressed: false, template }`
 *
 * When multiple templates exist for the same trigger key, the first active one
 * is returned. If none are active, returns `inactive_template`.
 *
 * @param triggerKey - The trigger key to look up (e.g. 'complaint_open').
 * @param templates  - All available notification templates.
 * @returns ActiveResult or SuppressedResult.
 */
export function getActiveTemplate(
  triggerKey: string,
  templates: NotificationTemplate[],
): SuppressedResult | ActiveResult {
  const matching = templates.filter((t) => t.trigger_key === triggerKey);

  if (matching.length === 0) {
    return { suppressed: true, reason: "missing_template" };
  }

  const active = matching.find((t) => t.is_active);
  if (!active) {
    return { suppressed: true, reason: "inactive_template" };
  }

  return { suppressed: false, template: active };
}
