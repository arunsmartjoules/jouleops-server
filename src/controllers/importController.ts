import type { Request, Response } from "express";
import { supabase } from "../config/supabase";
import * as XLSX from "xlsx";
import { Readable } from "stream";

// Multer adds 'file' to req
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export const importData = async (req: MulterRequest, res: Response) => {
  let jobId: string | null = null;
  try {
    const { type } = req.params;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });
    }

    // Parse file buffer
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res
        .status(400)
        .json({ success: false, error: "No sheets found in file" });
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return res
        .status(400)
        .json({ success: false, error: "Sheet content missing" });
    }
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ success: false, error: "File is empty" });
    }

    // 1. Initialize Import Job
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        type,
        status: "processing",
        total_rows: data.length,
        processed_rows: 0,
        success_rows: 0,
        failed_rows: 0,
        error_log: [],
      })
      .select()
      .single();

    if (jobError) throw jobError;
    jobId = job.id;

    let successCount = 0;
    let failedCount = 0;
    const errorLog: any[] = [];

    // 2. Process rows
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      let rowError: string | null = null;

      try {
        if (type === "users") {
          const cleanRow = {
            name: row["Full Name"] || row["name"],
            email: row["Email"] || row["email"],
            role: (row["Role"] || row["role"] || "technician").toLowerCase(),
            phone: row["Phone Number"] || row["phone"],
            status: "Active",
          };

          if (!cleanRow.email || !cleanRow.name) {
            rowError = "Missing required fields: Email or Name";
          } else {
            const { error } = await supabase
              .from("users")
              .upsert(cleanRow, { onConflict: "email" });
            if (error) rowError = error.message;
          }
        } else if (type === "assets") {
          const cleanRow = {
            asset_name: row["Asset Name"] || row["name"] || row["asset_name"],
            asset_type: row["Asset Type"] || row["type"] || row["asset_type"],
            site_id: row["Site ID"] || row["site_id"],
            location: row["Location"] || row["location"],
            serial_number: row["Serial Number"] || row["serial_number"],
            status: "Active",
            category: row["Category"] || "Other",
            make: row["Make"] || "",
            model: row["Model"] || "",
          };

          if (!cleanRow.asset_name || !cleanRow.asset_type) {
            rowError = "Missing required fields: Asset Name or Asset Type";
          } else {
            const { error } = await supabase.from("assets").insert(cleanRow);
            if (error) rowError = error.message;
          }
        } else if (type === "sites") {
          const cleanRow = {
            site_name: row["Site Name"] || row["name"],
            location: row["Location"] || row["location"],
            client_name: row["Client Name"] || row["client_name"],
            status: "Active",
          };

          if (!cleanRow.site_name) {
            rowError = "Missing required field: Site Name";
          } else {
            const { error } = await supabase.from("sites").insert(cleanRow);
            if (error) rowError = error.message;
          }
        } else if (type === "site-logs") {
          const cleanRow = {
            created_at:
              row["Date"] || row["created_at"] || new Date().toISOString(),
            site_id: row["Site ID"] || row["site_id"],
            exicuter_id:
              row["Technician"] || row["executor_id"] || row["exicuter_id"], // Support various column names
            log_name: row["Log Name"] || row["log_name"] || "Imported Log",
            remarks: row["Remarks"] || row["remarks"],
            // Map common fields if present, else let them be null
            temperature: row["Temperature"] || row["temperature"],
            ph: row["pH"] || row["ph"],
            tds: row["TDS"] || row["tds"],
            rh: row["RH"] || row["rh"],
            hardness: row["Hardness"] || row["hardness"],
            chemical_dosing: row["Chemical Dosing"] || row["chemical_dosing"],
            main_remarks: row["Main Remarks"] || row["main_remarks"],
          };

          if (!cleanRow.site_id) {
            rowError = "Missing required field: Site ID";
          } else {
            // Note: Use 'site_logs' table directly or service if logic needed
            const { error } = await supabase.from("site_logs").insert(cleanRow);
            if (error) rowError = error.message;
          }
        }

        if (rowError) {
          failedCount++;
          errorLog.push({ row: i + 1, error: rowError, data: row });
        } else {
          successCount++;
        }
      } catch (e: any) {
        failedCount++;
        errorLog.push({ row: i + 1, error: e.message, data: row });
      }

      // Periodically update progress (every 10 rows or at the end)
      if ((i + 1) % 10 === 0 || i === data.length - 1) {
        await supabase
          .from("import_jobs")
          .update({
            processed_rows: i + 1,
            success_rows: successCount,
            failed_rows: failedCount,
            error_log: errorLog.slice(-50), // Keep last 50 errors in DB
          })
          .eq("id", jobId);
      }
    }

    // 3. Complete Job
    await supabase
      .from("import_jobs")
      .update({
        status:
          failedCount === 0
            ? "completed"
            : successCount === 0
              ? "failed"
              : "completed", // or 'partial' if we added that
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return res.json({
      success: true,
      data: {
        jobId,
        total: data.length,
        success: successCount,
        failed: failedCount,
        errors: errorLog,
      },
    });
  } catch (error: any) {
    console.error("Import Controller Error:", error);
    if (jobId) {
      await supabase
        .from("import_jobs")
        .update({ status: "failed", error_log: [{ error: error.message }] })
        .eq("id", jobId);
    }
    res.status(500).json({ success: false, error: error.message });
  }
};
