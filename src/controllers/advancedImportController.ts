import type { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { z } from "zod";

// Base Schema Types
const SiteLogSchema = z.object({
  scheduled_date: z
    .string()
    .or(z.date())
    .transform((val) => new Date(val).toISOString()),
  site_id: z.string().min(1, "Site ID is required"),
  executor_id: z.string().min(1, "Technician ID is required"),
  remarks: z.string().optional(),
});

// Specific Schemas
const Schemas: Record<string, z.ZodSchema> = {
  "site-logs-temp-rh": SiteLogSchema.extend({
    temperature: z.coerce.number(),
    rh: z.coerce.number(),
    entry_time: z.string().optional(),
  }),
  "site-logs-water": SiteLogSchema.extend({
    tds: z.coerce.number(),
    ph: z.coerce.number(),
    hardness: z.coerce.number(),
  }),
  "site-logs-chemical": SiteLogSchema.extend({
    chemical_dosing: z.coerce.number(),
  }),
  attendance: z.object({
    date: z
      .string()
      .or(z.date())
      .transform((val) => new Date(val).toISOString()),
    employee_code: z.string(),
    site_code: z.string(),
    check_in_time: z.string(),
    check_out_time: z.string().optional(),
    status: z.enum(["Present", "Absent", "Leave", "Half Day"]).optional(),
    remarks: z.string().optional(),
  }),
  tickets: z.object({
    title: z.string().min(1),
    category: z.enum(["HVAC", "Electrical", "Plumbing", "IT", "Other"]),
    site_id: z.string().min(1),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
    status: z.enum(["Open", "In Progress", "Resolved", "Closed"]).optional(),
    assigned_to: z.string().optional(),
    location: z.string().optional(),
  }),
};

// Target Tables Map
const TargetTables: Record<string, string> = {
  "site-logs-temp-rh": "site_logs",
  "site-logs-water": "site_logs",
  "site-logs-chemical": "site_logs",
  attendance: "attendance_logs",
  tickets: "complaints",
};

export const validate = async (req: Request, res: Response) => {
  try {
    const { type, rows } = req.body;
    const schema = Schemas[type];

    if (!schema) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid import type" });
    }

    const validRows: any[] = [];
    const invalidRows: any[] = [];
    const errorsSet = new Set<string>();

    // 1. Fetch Reference Data (Optimization: Fetch all possible site_ids / user_ids once)
    // For now, we will do a simple check. For large datasets, we should batch fetch these.
    // Fetch all sites and users for validation
    const { data: sites } = await supabase
      .from("sites")
      .select("site_id, site_code");
    const { data: users } = await supabase
      .from("users")
      .select("id, employee_code");

    const validSiteIds = new Set(sites?.map((s) => s.site_id));
    const validSiteCodes = new Set(sites?.map((s) => s.site_code));
    const validUserIds = new Set(users?.map((u) => u.id));
    const validEmployeeCodes = new Set(users?.map((u) => u.employee_code));

    // 2. Validate Rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let rowErrors: string[] = [];

      // Zod Validation
      const parsed = schema.safeParse(row);
      let transformedRow = row;

      if (!parsed.success) {
        rowErrors = parsed.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );
      } else {
        transformedRow = parsed.data;
      }

      // Reference Validation (Manual)
      // Site Check
      if (transformedRow.site_id && !validSiteIds.has(transformedRow.site_id)) {
        rowErrors.push(`Invalid Site ID: ${transformedRow.site_id}`);
      }
      if (
        transformedRow.site_code &&
        !validSiteCodes.has(transformedRow.site_code)
      ) {
        rowErrors.push(`Invalid Site Code: ${transformedRow.site_code}`);
      }

      // User Check
      if (
        transformedRow.executor_id &&
        !validUserIds.has(transformedRow.executor_id) &&
        !validEmployeeCodes.has(transformedRow.executor_id)
      ) {
        rowErrors.push(`Invalid Technician ID: ${transformedRow.executor_id}`);
      }
      if (
        transformedRow.employee_code &&
        !validEmployeeCodes.has(transformedRow.employee_code)
      ) {
        rowErrors.push(
          `Invalid Employee Code: ${transformedRow.employee_code}`,
        );
      }
      if (
        transformedRow.assigned_to &&
        !validUserIds.has(transformedRow.assigned_to)
      ) {
        rowErrors.push(
          `Invalid Assigned User ID: ${transformedRow.assigned_to}`,
        );
      }

      if (rowErrors.length > 0) {
        rowErrors.forEach((e) => errorsSet.add(e));
        invalidRows.push({ ...row, _errors: rowErrors });
      } else {
        // Add static fields based on type
        if (type === "site-logs-temp-rh") transformedRow.log_name = "Temp RH";
        if (type === "site-logs-water")
          transformedRow.log_name = "Water Parameters";
        if (type === "site-logs-chemical")
          transformedRow.log_name = "Chemical Dosing";

        // Clean up row (remove _rowIndex, etc)
        const cleanRow = { ...transformedRow };
        delete cleanRow._rowIndex;
        delete cleanRow._errors;

        validRows.push(cleanRow);
      }
    }

    res.json({
      success: true,
      data: {
        validRows,
        invalidRows,
        errors: Array.from(errorsSet),
      },
    });
  } catch (error: any) {
    console.error("Validation Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const commit = async (req: Request, res: Response) => {
  try {
    const { type, rows } = req.body;
    const tableName = TargetTables[type];

    if (!tableName) {
      return res
        .status(400)
        .json({ success: false, error: "Unknown table for type" });
    }

    if (!rows || rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No rows to import" });
    }

    // Batch insert
    const { error } = await supabase.from(tableName).insert(rows).select("*");

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        success: rows.length, // Assuming all succeeded if insertion didn't throw
        failed: 0,
      },
    });
  } catch (error: any) {
    console.error("Commit Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
