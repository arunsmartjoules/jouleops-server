// Feature: push-notification-control, Property 12: Template CRUD round-trip
//
// For any valid notification template object (with title_template, body_template,
// trigger_key, is_active), saving the template and then retrieving it should
// return an object with content identical to what was saved.
//
// Validates: Requirements 9.2, 9.3, 9.9

import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory DB store — simulates the notification_templates table
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  trigger_key: string;
  template_name: string;
  title_template: string;
  body_template: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const TRIGGER_KEYS = [
  "punch_in",
  "punch_out",
  "complaint_open",
  "complaint_inprogress",
] as const;

type TriggerKey = (typeof TRIGGER_KEYS)[number];

let store: Map<string, Row>;
let idCounter: number;

function makeEmptyStore(): Map<string, Row> {
  return new Map<string, Row>();
}

function generateId(): string {
  return `id-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Mock @jouleops/shared before importing the repository
// ---------------------------------------------------------------------------

mock.module("@jouleops/shared", () => {
  return {
    // query<T>(sql, params) — used by getAllTemplates
    // Returns all rows sorted by created_at DESC
    query: async <T>(_sql: string, _params?: any[]): Promise<T[]> => {
      const rows = [...store.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return rows as unknown as T[];
    },

    // queryOne<T>(sql, params) — used by createTemplate, updateTemplate, deleteTemplate
    queryOne: async <T>(sql: string, params?: any[]): Promise<T | null> => {
      const normalised = sql.replace(/\s+/g, " ").trim().toUpperCase();

      // INSERT RETURNING — createTemplate
      if (normalised.startsWith("INSERT INTO NOTIFICATION_TEMPLATES")) {
        const [trigger_key, template_name, title_template, body_template, is_active] =
          params as [string, string, string, string, boolean];
        const id = generateId();
        const now = new Date().toISOString();
        const row: Row = {
          id,
          trigger_key,
          template_name,
          title_template,
          body_template,
          is_active,
          created_at: now,
          updated_at: now,
        };
        store.set(id, row);
        return row as unknown as T;
      }

      // DELETE RETURNING — deleteTemplate
      if (normalised.startsWith("DELETE FROM NOTIFICATION_TEMPLATES")) {
        const id = params![0] as string;
        const row = store.get(id);
        if (!row) return null;
        store.delete(id);
        return { id } as unknown as T;
      }

      // UPDATE RETURNING — updateTemplate (with SET clauses)
      if (
        normalised.startsWith("UPDATE NOTIFICATION_TEMPLATES") &&
        normalised.includes("RETURNING")
      ) {
        // The id is the last param in the values array
        const id = params![params!.length - 1] as string;
        const row = store.get(id);
        if (!row) return null;

        // Apply pending update fields via side-channel
        const pending = pendingUpdate;
        if (pending) {
          const updated: Row = { ...row };
          if (pending.trigger_key !== undefined) updated.trigger_key = pending.trigger_key;
          if (pending.template_name !== undefined) updated.template_name = pending.template_name;
          if (pending.title_template !== undefined) updated.title_template = pending.title_template;
          if (pending.body_template !== undefined) updated.body_template = pending.body_template;
          if (pending.is_active !== undefined) updated.is_active = pending.is_active;
          updated.updated_at = new Date().toISOString();
          store.set(id, updated);
          pendingUpdate = null;
          return updated as unknown as T;
        }

        return row as unknown as T;
      }

      // SELECT — updateTemplate no-op path (nothing to update)
      if (normalised.startsWith("SELECT") && normalised.includes("NOTIFICATION_TEMPLATES")) {
        const id = params![0] as string;
        const row = store.get(id);
        return (row ?? null) as unknown as T;
      }

      return null;
    },
  };
});

// Side-channel: set before calling updateTemplate so the mock knows which
// fields to apply (avoids SQL parsing in the mock — mirrors the triggerConfig pattern).
let pendingUpdate: {
  trigger_key?: string;
  template_name?: string;
  title_template?: string;
  body_template?: string;
  is_active?: boolean;
} | null = null;

// Import AFTER mock.module so the repository picks up the mocked @jouleops/shared
const {
  getAllTemplates,
  createTemplate,
  updateTemplate,
} = await import("../notificationTemplateRepository.ts");

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** One of the four valid trigger keys */
const triggerKeyArb = fc.constantFrom(...TRIGGER_KEYS);

/** Non-empty string (trimmed), max 200 chars */
const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Valid template_name: non-empty string */
const templateNameArb = nonEmptyStringArb;

/** Valid title_template: non-empty string */
const titleTemplateArb = nonEmptyStringArb;

/** Valid body_template: non-empty string */
const bodyTemplateArb = nonEmptyStringArb;

/** Arbitrary for a complete valid CreateTemplateInput */
const createInputArb = fc.record({
  trigger_key: triggerKeyArb,
  template_name: templateNameArb,
  title_template: titleTemplateArb,
  body_template: bodyTemplateArb,
  is_active: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 12: Template CRUD round-trip", () => {
  beforeEach(() => {
    store = makeEmptyStore();
    idCounter = 0;
    pendingUpdate = null;
  });

  test(
    "createTemplate then getAllTemplates returns a template with identical content",
    async () => {
      await fc.assert(
        fc.asyncProperty(createInputArb, async (input) => {
          store = makeEmptyStore();
          idCounter = 0;

          await createTemplate(input);

          const templates = await getAllTemplates();
          expect(templates).toHaveLength(1);

          const saved = templates[0];
          expect(saved.trigger_key).toBe(input.trigger_key);
          expect(saved.template_name).toBe(input.template_name);
          expect(saved.title_template).toBe(input.title_template);
          expect(saved.body_template).toBe(input.body_template);
          expect(saved.is_active).toBe(input.is_active);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "updateTemplate then getAllTemplates returns a template with the updated content",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          createInputArb,
          titleTemplateArb,
          bodyTemplateArb,
          async (initial, newTitle, newBody) => {
            store = makeEmptyStore();
            idCounter = 0;

            const created = await createTemplate(initial);

            const updateInput = { title_template: newTitle, body_template: newBody };
            pendingUpdate = updateInput;
            await updateTemplate(created.id, updateInput);

            const templates = await getAllTemplates();
            expect(templates).toHaveLength(1);

            const saved = templates[0];
            expect(saved.id).toBe(created.id);
            expect(saved.title_template).toBe(newTitle);
            expect(saved.body_template).toBe(newBody);
            // Fields not updated should remain unchanged
            expect(saved.trigger_key).toBe(initial.trigger_key);
            expect(saved.template_name).toBe(initial.template_name);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "updateTemplate is_active round-trips the boolean value",
    async () => {
      await fc.assert(
        fc.asyncProperty(createInputArb, fc.boolean(), async (initial, newIsActive) => {
          store = makeEmptyStore();
          idCounter = 0;

          const created = await createTemplate(initial);

          pendingUpdate = { is_active: newIsActive };
          await updateTemplate(created.id, { is_active: newIsActive });

          const templates = await getAllTemplates();
          expect(templates).toHaveLength(1);
          expect(templates[0].is_active).toBe(newIsActive);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "createTemplate then getAllTemplates returns exactly one template per created template",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createInputArb, { minLength: 1, maxLength: 5 }),
          async (inputs) => {
            store = makeEmptyStore();
            idCounter = 0;

            for (const input of inputs) {
              await createTemplate(input);
            }

            const templates = await getAllTemplates();
            expect(templates).toHaveLength(inputs.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "updateTemplate with all fields round-trips all updated values",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          createInputArb,
          triggerKeyArb,
          templateNameArb,
          titleTemplateArb,
          bodyTemplateArb,
          fc.boolean(),
          async (initial, newTriggerKey, newName, newTitle, newBody, newIsActive) => {
            store = makeEmptyStore();
            idCounter = 0;

            const created = await createTemplate(initial);

            const updateInput = {
              trigger_key: newTriggerKey,
              template_name: newName,
              title_template: newTitle,
              body_template: newBody,
              is_active: newIsActive,
            };
            pendingUpdate = updateInput;
            await updateTemplate(created.id, updateInput);

            const templates = await getAllTemplates();
            expect(templates).toHaveLength(1);

            const saved = templates[0];
            expect(saved.trigger_key).toBe(newTriggerKey);
            expect(saved.template_name).toBe(newName);
            expect(saved.title_template).toBe(newTitle);
            expect(saved.body_template).toBe(newBody);
            expect(saved.is_active).toBe(newIsActive);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
