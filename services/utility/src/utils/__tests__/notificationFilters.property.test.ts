// Feature: push-notification-control, Property 10: Exclusion list controls notification dispatch
// Feature: push-notification-control, Property 13: Variable placeholder resolution
// Feature: push-notification-control, Property 14: Inactive template suppresses notifications

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  filterExcludedUsers,
  resolvePlaceholders,
  getActiveTemplate,
  type NotificationTemplate,
} from "../notificationFilters.ts";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a non-empty alphanumeric user ID string */
const userIdArb = fc.uuid();

/** Generate an array of unique user IDs */
const userIdsArb = fc.array(userIdArb, { minLength: 0, maxLength: 20 }).map(
  (ids) => [...new Set(ids)],
);

/** Generate a valid variable name (word characters only) */
const varNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/);

/** Generate a simple string value (no {{ or }} to avoid ambiguity) */
const varValueArb = fc.string({ minLength: 0, maxLength: 30 }).filter(
  (s) => !s.includes("{{") && !s.includes("}}"),
);

/** Generate a NotificationTemplate */
const templateArb = (triggerKey: string, isActive: boolean): fc.Arbitrary<NotificationTemplate> =>
  fc.record({
    id: fc.uuid(),
    trigger_key: fc.constant(triggerKey),
    is_active: fc.constant(isActive),
    title_template: fc.string({ minLength: 1, maxLength: 50 }),
    body_template: fc.string({ minLength: 1, maxLength: 100 }),
  });

// ---------------------------------------------------------------------------
// Property 10: Exclusion list controls notification dispatch
// Validates: Requirements 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------

describe("Property 10: Exclusion list controls notification dispatch", () => {
  test("any user in the exclusion list is NEVER in the result", () => {
    fc.assert(
      fc.property(userIdsArb, userIdsArb, (allUsers, excluded) => {
        const result = filterExcludedUsers(allUsers, excluded);
        const excludedSet = new Set(excluded);
        for (const id of result) {
          expect(excludedSet.has(id)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("any user NOT in the exclusion list is ALWAYS in the result", () => {
    fc.assert(
      fc.property(userIdsArb, userIdsArb, (allUsers, excluded) => {
        const result = filterExcludedUsers(allUsers, excluded);
        const excludedSet = new Set(excluded);
        const resultSet = new Set(result);
        for (const id of allUsers) {
          if (!excludedSet.has(id)) {
            expect(resultSet.has(id)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test("result is always a subset of the input", () => {
    fc.assert(
      fc.property(userIdsArb, userIdsArb, (allUsers, excluded) => {
        const result = filterExcludedUsers(allUsers, excluded);
        const inputSet = new Set(allUsers);
        for (const id of result) {
          expect(inputSet.has(id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  test("empty exclusion list returns all users unchanged", () => {
    fc.assert(
      fc.property(userIdsArb, (allUsers) => {
        const result = filterExcludedUsers(allUsers, []);
        expect(result).toEqual(allUsers);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Variable placeholder resolution
// Validates: Requirements 9.5
// ---------------------------------------------------------------------------

describe("Property 13: Variable placeholder resolution", () => {
  test("when all variables are provided, no {{...}} tokens remain in the result", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(varNameArb, varValueArb), { minLength: 1, maxLength: 8 }),
        (pairs) => {
          // Build a template that uses every variable at least once
          const context = Object.fromEntries(pairs);
          const template = pairs.map(([k]) => `{{${k}}}`).join(" ");
          const result = resolvePlaceholders(template, context);
          expect(result).not.toMatch(/\{\{[^}]+\}\}/);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("each placeholder is replaced with the correct value from the context map", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(varNameArb, varValueArb), { minLength: 1, maxLength: 8 }),
        (pairs) => {
          // Deduplicate by key (last value wins, matching Object.fromEntries behaviour)
          const context = Object.fromEntries(pairs);
          const dedupedPairs = Object.entries(context);
          for (const [key, value] of dedupedPairs) {
            const template = `prefix {{${key}}} suffix`;
            const result = resolvePlaceholders(template, context);
            expect(result).toBe(`prefix ${value} suffix`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("text without placeholders is returned unchanged", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }).filter(
          (s) => !s.includes("{{") && !s.includes("}}"),
        ),
        fc.dictionary(varNameArb, varValueArb),
        (plainText, context) => {
          const result = resolvePlaceholders(plainText, context);
          expect(result).toBe(plainText);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("multiple occurrences of the same placeholder are all replaced", () => {
    fc.assert(
      fc.property(
        varNameArb,
        varValueArb,
        fc.integer({ min: 2, max: 5 }),
        (key, value, count) => {
          const context = { [key]: value };
          const template = Array(count).fill(`{{${key}}}`).join("-");
          const result = resolvePlaceholders(template, context);
          const expected = Array(count).fill(value).join("-");
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Inactive template suppresses notifications
// Validates: Requirements 3.5, 4.5, 9.8
// ---------------------------------------------------------------------------

describe("Property 14: Inactive template suppresses notifications", () => {
  test("an inactive template always returns suppressed=true with reason 'inactive_template'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        templateArb("complaint_open", false),
        (triggerKey, template) => {
          const t = { ...template, trigger_key: triggerKey };
          const result = getActiveTemplate(triggerKey, [t]);
          expect(result.suppressed).toBe(true);
          if (result.suppressed) {
            expect(result.reason).toBe("inactive_template");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("a missing template always returns suppressed=true with reason 'missing_template'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.array(templateArb("other_trigger", true), { minLength: 0, maxLength: 5 }),
        (triggerKey, otherTemplates) => {
          // Ensure none of the other templates match triggerKey
          const templates = otherTemplates.map((t) => ({
            ...t,
            trigger_key: `other_${t.id.slice(0, 4)}`,
          }));
          const result = getActiveTemplate(triggerKey, templates);
          expect(result.suppressed).toBe(true);
          if (result.suppressed) {
            expect(result.reason).toBe("missing_template");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("an active template always returns suppressed=false with the template object", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        templateArb("complaint_open", true),
        (triggerKey, template) => {
          const t = { ...template, trigger_key: triggerKey };
          const result = getActiveTemplate(triggerKey, [t]);
          expect(result.suppressed).toBe(false);
          if (!result.suppressed) {
            expect(result.template).toEqual(t);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("when multiple templates exist for a trigger, the active one is returned", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        templateArb("complaint_open", true),
        fc.array(templateArb("complaint_open", false), { minLength: 1, maxLength: 4 }),
        (triggerKey, activeTemplate, inactiveTemplates) => {
          const active = { ...activeTemplate, trigger_key: triggerKey };
          const inactive = inactiveTemplates.map((t) => ({
            ...t,
            trigger_key: triggerKey,
          }));
          // Mix active and inactive templates in the list
          const allTemplates = [...inactive, active];
          const result = getActiveTemplate(triggerKey, allTemplates);
          expect(result.suppressed).toBe(false);
          if (!result.suppressed) {
            expect(result.template.is_active).toBe(true);
            expect(result.template.trigger_key).toBe(triggerKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
