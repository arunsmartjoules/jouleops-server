/**
 * Chiller Readings Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import chillerReadingsRepository from "../repositories/chillerReadingsRepository.ts";
import fpSyncRepository from "../repositories/fpSyncRepository.ts";
import {
  createChillerReadingInFieldproxy,
  updateChillerReadingInFieldproxy,
  syncChillerReadingToFieldproxy,
} from "../services/fieldproxyService.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  asyncHandler,
  logActivity,
} from "@jouleops/shared";
import { calculateDateShift } from "../utils/shiftHelper.ts";

export const create = asyncHandler(async (req: Request, res: Response) => {
  // ── Ensure date_shift exists before repository call if possible ────────────
  if (!req.body.date_shift) {
    req.body.date_shift = calculateDateShift(req.body.reading_time);
  }

  const reading = await chillerReadingsRepository.createChillerReading(
    req.body,
  );

  logActivity({
    user_id: (req as any).user?.user_id || (req as any).user?.id,
    action: "CREATE_CHILLER_READING",
    module: "CHILLER_READING",
    description: `Created chiller reading ${reading.id} for chiller ${reading.chiller_id}`,
    metadata: { readingId: reading.id, chillerId: reading.chiller_id, siteCode: reading.site_code },
  });

  // Sync to Fieldproxy — fire and forget (CREATE)
  createChillerReadingInFieldproxy({
    log_id: reading.log_id,
    site_id: reading.site_code,
    chiller_id: reading.chiller_id,
    date_shift: reading.date_shift || calculateDateShift(reading.reading_time),
    executor_id: reading.executor_id,
    reading_time: reading.reading_time,
    condenser_inlet_temp: reading.condenser_inlet_temp,
    condenser_outlet_temp: reading.condenser_outlet_temp,
    evaporator_inlet_temp: reading.evaporator_inlet_temp,
    evaporator_outlet_temp: reading.evaporator_outlet_temp,
    compressor_suction_temp: reading.compressor_suction_temp,
    motor_temperature: reading.motor_temperature,
    saturated_condenser_temp: reading.saturated_condenser_temp,
    saturated_suction_temp: reading.saturated_suction_temp,
    discharge_pressure: reading.discharge_pressure,
    main_suction_pressure: reading.main_suction_pressure,
    oil_pressure: reading.oil_pressure,
    oil_pressure_difference: reading.oil_pressure_difference,
    compressor_load_percentage: reading.compressor_load_percentage ?? reading.compressor_load_percent,
    inline_btu_meter: reading.inline_btu_meter,
    set_point_celsius: reading.set_point_celsius ?? reading.set_point,
    condenser_inlet_pressure: reading.condenser_inlet_pressure,
    condenser_outlet_pressure: reading.condenser_outlet_pressure,
    evaporator_inlet_pressure: reading.evaporator_inlet_pressure,
    evaporator_outlet_pressure: reading.evaporator_outlet_pressure,
    remarks: reading.remarks,
    sla_status: reading.sla_status,
    signature_text: reading.signature_text,
    attachments: reading.attachments,
    startdatetime: reading.startdatetime ?? reading.start_datetime,
    enddatetime: reading.enddatetime,
  })
    .then(async (fp) => {
      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action: "SYNC_TO_FIELDPROXY",
        module: "CHILLER_READING",
        description: `Created chiller reading ${reading.id} in Fieldproxy`,
        metadata: { readingId: reading.id, fieldproxy: fp },
      }).catch(() => {});
      // createChillerReadingInFieldproxy always creates (no upsert path).
      await fpSyncRepository.recordSynced(
        "chiller_readings",
        reading.id,
        "created",
      );
    })
    .catch(async (err) => {
      console.error("[FIELDPROXY] chiller reading create sync failed:", err);
      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action: "SYNC_TO_FIELDPROXY_FAILED",
        module: "CHILLER_READING",
        description: `Failed to create chiller reading ${reading.id} in Fieldproxy`,
        metadata: { readingId: reading.id, error: err.message },
      }).catch(() => {});
      await fpSyncRepository.recordFailed(
        "chiller_readings",
        reading.id,
        err?.message || String(err),
      );
    });
  fpSyncRepository.recordPending("chiller_readings", reading.id);

  return sendCreated(res, reading);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "ID is required");
  }
  const reading = await chillerReadingsRepository.getChillerReadingById(id);
  if (!reading) {
    return sendNotFound(res, "Chiller reading");
  }
  return sendSuccess(res, reading);
});

export const getBySite = asyncHandler(async (req: Request, res: Response) => {
  const { siteCode } = req.params;
  if (!siteCode) {
    return sendError(res, "Site Code is required");
  }
  const {
    page,
    limit,
    search,
    fromDate,
    toDate,
    chiller_id,
    date_from,
    date_to,
    sortBy,
    sortOrder,
    filters,
  } = req.query;

  let chillerIdFilter = chiller_id as string | undefined;
  if (filters) {
    try {
      const parsedFilters = JSON.parse(filters as string);
      const chillerRule = parsedFilters.find(
        (f: any) => f.fieldId === "chiller_id",
      );
      if (chillerRule) chillerIdFilter = chillerRule.value;
    } catch (e) {
      console.error("[CHILLER_READINGS_CONTROLLER] Error parsing filters:", e);
    }
  }

  const result = await chillerReadingsRepository.getChillerReadingsBySite(
    siteCode,
    {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      chiller_id: chillerIdFilter,
      date_from: (date_from as string) || (fromDate as string) || undefined,
      date_to: (date_to as string) || (toDate as string) || undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      search: search as string | undefined,
    },
  );
  return sendSuccess(res, result.data, { pagination: result.pagination });
});

export const getByChiller = asyncHandler(
  async (req: Request, res: Response) => {
    const { chillerId } = req.params;
    if (!chillerId) {
      return sendError(res, "Chiller ID is required");
    }
    const { limit, date_from, date_to } = req.query;
    const readings =
      await chillerReadingsRepository.getChillerReadingsByChiller(chillerId, {
        limit: parseInt(limit as string) || 50,
        date_from: date_from as string | undefined,
        date_to: date_to as string | undefined,
      });
    return sendSuccess(res, readings);
  },
);

export const getLatest = asyncHandler(async (req: Request, res: Response) => {
  const { chillerId } = req.params;
  if (!chillerId) {
    return sendError(res, "Chiller ID is required");
  }
  const reading =
    await chillerReadingsRepository.getLatestReadingByChiller(chillerId);
  if (!reading) {
    return sendNotFound(res, "Readings");
  }
  return sendSuccess(res, reading);
});

export const getByDateShift = asyncHandler(
  async (req: Request, res: Response) => {
    const { siteCode, dateShift } = req.params;
    if (!siteCode || !dateShift) {
      return sendError(res, "Site Code and Date Shift are required");
    }
    const readings = await chillerReadingsRepository.getReadingsByDateShift(
      siteCode,
      dateShift,
    );
    return sendSuccess(res, readings);
  },
);

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "ID is required");
  }
  const existing = await chillerReadingsRepository.getChillerReadingById(id);
  if (!existing) {
    return sendNotFound(res, "Chiller reading");
  }

  const reading = await chillerReadingsRepository.updateChillerReading(
    id,
    req.body,
  );

  logActivity({
    user_id: (req as any).user?.user_id || (req as any).user?.id,
    action: "UPDATE_CHILLER_READING",
    module: "CHILLER_READING",
    description: `Updated chiller reading ${id} for chiller ${reading.chiller_id}`,
    metadata: { readingId: id, chillerId: reading.chiller_id, siteCode: reading.site_code },
  });

  // Sync to Fieldproxy — fire and forget (UPDATE, lookup by log_id)
  if (reading.log_id) {
    fpSyncRepository.recordPending("chiller_readings", id);
    updateChillerReadingInFieldproxy({
      log_id: reading.log_id,
      site_id: reading.site_code,
      chiller_id: reading.chiller_id,
      date_shift: reading.date_shift || calculateDateShift(reading.reading_time),
      executor_id: reading.executor_id,
      reading_time: reading.reading_time,
      condenser_inlet_temp: reading.condenser_inlet_temp,
      condenser_outlet_temp: reading.condenser_outlet_temp,
      evaporator_inlet_temp: reading.evaporator_inlet_temp,
      evaporator_outlet_temp: reading.evaporator_outlet_temp,
      compressor_suction_temp: reading.compressor_suction_temp,
      motor_temperature: reading.motor_temperature,
      saturated_condenser_temp: reading.saturated_condenser_temp,
      saturated_suction_temp: reading.saturated_suction_temp,
      discharge_pressure: reading.discharge_pressure,
      main_suction_pressure: reading.main_suction_pressure,
      oil_pressure: reading.oil_pressure,
      oil_pressure_difference: reading.oil_pressure_difference,
      compressor_load_percentage: reading.compressor_load_percentage ?? reading.compressor_load_percent,
      inline_btu_meter: reading.inline_btu_meter,
      set_point_celsius: reading.set_point_celsius ?? reading.set_point,
      condenser_inlet_pressure: reading.condenser_inlet_pressure,
      condenser_outlet_pressure: reading.condenser_outlet_pressure,
      evaporator_inlet_pressure: reading.evaporator_inlet_pressure,
      evaporator_outlet_pressure: reading.evaporator_outlet_pressure,
      remarks: reading.remarks,
      sla_status: reading.sla_status,
      signature_text: reading.signature_text,
      attachments: reading.attachments,
      startdatetime: reading.startdatetime ?? reading.start_datetime,
      enddatetime: reading.enddatetime,
    })
      .then(async (fp) => {
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY",
          module: "CHILLER_READING",
          description: `Updated chiller reading ${id} in Fieldproxy`,
          metadata: { readingId: id, log_id: reading.log_id, fieldproxy: fp },
        }).catch(() => {});
        if (fp?.error) {
          await fpSyncRepository.recordFailed(
            "chiller_readings",
            id,
            fp.error,
          );
        } else {
          // updateChillerReadingInFieldproxy looks up by log_id; if it returns
          // without error, the FP row exists AND was updated, so it's verified.
          await fpSyncRepository.recordSynced(
            "chiller_readings",
            id,
            "updated",
          );
          await fpSyncRepository.recordVerified("chiller_readings", id);
        }
      })
      .catch(async (err) => {
        console.error("[FIELDPROXY] chiller reading update sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "CHILLER_READING",
          description: `Failed to update chiller reading ${id} in Fieldproxy`,
          metadata: { readingId: id, error: err.message },
        }).catch(() => {});
        await fpSyncRepository.recordFailed(
          "chiller_readings",
          id,
          err?.message || String(err),
        );
      });
  } else {
    await fpSyncRepository.recordSkipped(
      "chiller_readings",
      id,
      "Missing log_id",
    );
  }

  return sendSuccess(res, reading);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "ID is required");
  }
  const existing = await chillerReadingsRepository.getChillerReadingById(id);
  if (!existing) {
    return sendNotFound(res, "Chiller reading");
  }

  await chillerReadingsRepository.deleteChillerReading(id);

  // Log the activity
  logActivity({
    user_id: (req as any).user?.user_id || (req as any).user?.id,
    action: "DELETE_CHILLER_READING",
    module: "CHILLER_READING",
    description: `Deleted chiller reading ${id}`,
    metadata: { readingId: id, chillerId: existing.chiller_id, siteCode: existing.site_code },
  });

  return sendSuccess(res, null, {
    message: "Chiller reading deleted successfully",
  });
});

export const bulkRemove = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return sendError(res, "Invalid IDs provided");
  }
  const result = await chillerReadingsRepository.deleteChillerReadings(ids);
  return sendSuccess(res, result);
});

export const getAverages = asyncHandler(async (req: Request, res: Response) => {
  const { chillerId } = req.params;
  if (!chillerId) {
    return sendError(res, "Chiller ID is required");
  }
  const { date_from, date_to } = req.query;
  if (!date_from || !date_to) {
    return sendError(res, "date_from and date_to are required");
  }

  const averages = await chillerReadingsRepository.getChillerAverages(
    chillerId,
    date_from as string,
    date_to as string,
  );
  return sendSuccess(res, averages);
});

export const getAll = asyncHandler(
  async (req: Request, res: Response, next) => {
    req.params.siteCode = "all";
    return getBySite(req, res, next);
  },
);

type ManualChillerSyncResult = {
  id: string;
  log_id?: string | null;
  action: "created" | "updated" | "skipped" | "failed";
  message?: string;
  error?: string;
};

const buildChillerSyncPayload = (reading: any) => ({
  log_id: reading.log_id,
  site_id: reading.site_code,
  chiller_id: reading.chiller_id,
  date_shift: reading.date_shift || calculateDateShift(reading.reading_time),
  executor_id: reading.executor_id,
  reading_time: reading.reading_time,
  condenser_inlet_temp: reading.condenser_inlet_temp,
  condenser_outlet_temp: reading.condenser_outlet_temp,
  evaporator_inlet_temp: reading.evaporator_inlet_temp,
  evaporator_outlet_temp: reading.evaporator_outlet_temp,
  compressor_suction_temp: reading.compressor_suction_temp,
  motor_temperature: reading.motor_temperature,
  saturated_condenser_temp: reading.saturated_condenser_temp,
  saturated_suction_temp: reading.saturated_suction_temp,
  discharge_pressure: reading.discharge_pressure,
  main_suction_pressure: reading.main_suction_pressure,
  oil_pressure: reading.oil_pressure,
  oil_pressure_difference: reading.oil_pressure_difference,
  compressor_load_percentage:
    reading.compressor_load_percentage ?? reading.compressor_load_percent,
  inline_btu_meter: reading.inline_btu_meter,
  set_point_celsius: reading.set_point_celsius ?? reading.set_point,
  condenser_inlet_pressure: reading.condenser_inlet_pressure,
  condenser_outlet_pressure: reading.condenser_outlet_pressure,
  evaporator_inlet_pressure: reading.evaporator_inlet_pressure,
  evaporator_outlet_pressure: reading.evaporator_outlet_pressure,
  remarks: reading.remarks,
  sla_status: reading.sla_status,
  signature_text: reading.signature_text,
  attachments: reading.attachments,
  startdatetime: reading.startdatetime ?? reading.start_datetime,
  enddatetime: reading.enddatetime,
});

const syncSingleChillerReading = async (
  reading: any,
): Promise<ManualChillerSyncResult> => {
  fpSyncRepository.recordPending("chiller_readings", reading.id);
  try {
    const fp = await syncChillerReadingToFieldproxy(
      buildChillerSyncPayload(reading),
    );

    if (fp.error && fp.action !== "skipped") {
      await fpSyncRepository.recordFailed(
        "chiller_readings",
        reading.id,
        fp.error,
      );
      return {
        id: reading.id,
        log_id: reading.log_id,
        action: "failed",
        error: fp.error,
      };
    }

    if (fp.action === "skipped") {
      await fpSyncRepository.recordSkipped("chiller_readings", reading.id);
    } else {
      // syncChillerReadingToFieldproxy returning created/updated without error
      // means the FP write API confirmed the row, so it's verified.
      await fpSyncRepository.recordSynced(
        "chiller_readings",
        reading.id,
        fp.action,
      );
      await fpSyncRepository.recordVerified("chiller_readings", reading.id);
    }

    return {
      id: reading.id,
      log_id: reading.log_id,
      action: fp.action,
      message:
        fp.action === "created"
          ? "Created new Fieldproxy row"
          : fp.action === "skipped"
            ? "No fields to update"
            : "Updated existing Fieldproxy row",
    };
  } catch (error: any) {
    const msg = error?.message || "Failed to sync chiller reading to Fieldproxy";
    await fpSyncRepository.recordFailed("chiller_readings", reading.id, msg);
    return {
      id: reading.id,
      log_id: reading.log_id,
      action: "failed",
      error: msg,
    };
  }
};

export const syncFieldproxySingle = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Chiller reading ID is required");
    }

    const reading = await chillerReadingsRepository.getChillerReadingById(id);
    if (!reading) {
      return sendNotFound(res, "Chiller reading");
    }

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "MANUAL_FIELDPROXY_SYNC_START",
      module: "CHILLER_READING",
      description: `Manual Fieldproxy sync started for chiller reading ${id}`,
      metadata: { readingId: id, log_id: reading.log_id, mode: "single" },
    }).catch(() => {});

    const result = await syncSingleChillerReading(reading);

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action:
        result.action === "failed"
          ? "MANUAL_FIELDPROXY_SYNC_FAILED"
          : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
      module: "CHILLER_READING",
      description:
        result.action === "failed"
          ? `Manual Fieldproxy sync failed for chiller reading ${id}`
          : `Manual Fieldproxy sync ${result.action} for chiller reading ${id}`,
      metadata: {
        readingId: id,
        log_id: reading.log_id,
        mode: "single",
        action: result.action,
        error: result.error,
      },
    }).catch(() => {});

    if (result.action === "failed") {
      return sendError(res, result.error || "Fieldproxy sync failed");
    }

    return sendSuccess(res, result, {
      message: `Fieldproxy sync ${result.action} for chiller reading ${id}`,
    });
  },
);

export const syncFieldproxyBulk = asyncHandler(
  async (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "ids array is required");
    }

    const uniqueIds = Array.from(
      new Set(ids.map((i) => String(i).trim()).filter(Boolean)),
    );
    const results: ManualChillerSyncResult[] = [];

    for (const id of uniqueIds) {
      const reading = await chillerReadingsRepository.getChillerReadingById(id);
      if (!reading) {
        results.push({
          id,
          action: "failed",
          error: "Chiller reading not found",
        });
        continue;
      }

      const result = await syncSingleChillerReading(reading);
      results.push(result);

      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action:
          result.action === "failed"
            ? "MANUAL_FIELDPROXY_SYNC_FAILED"
            : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
        module: "CHILLER_READING",
        description:
          result.action === "failed"
            ? `Bulk Fieldproxy sync failed for chiller reading ${id}`
            : `Bulk Fieldproxy sync ${result.action} for chiller reading ${id}`,
        metadata: {
          readingId: id,
          log_id: reading.log_id,
          mode: "bulk",
          action: result.action,
          error: result.error,
        },
      }).catch(() => {});
    }

    const summary = {
      total: results.length,
      updated: results.filter((r) => r.action === "updated").length,
      created: results.filter((r) => r.action === "created").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Fieldproxy bulk sync completed: updated ${summary.updated}, created ${summary.created}, failed ${summary.failed}`,
      },
    );
  },
);

export const backfillFpSync = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      limit: rawLimit,
      site_code,
      chiller_id,
      reading_time_from,
      reading_time_to,
      only_failed,
      dry_run,
    } = (req.body || {}) as {
      limit?: number;
      site_code?: string;
      chiller_id?: string;
      reading_time_from?: string;
      reading_time_to?: string;
      only_failed?: boolean;
      dry_run?: boolean;
    };

    const limit = Math.min(Math.max(Number(rawLimit) || 100, 1), 500);
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (only_failed) {
      conditions.push(`fp_sync_status = 'failed'`);
    } else {
      conditions.push(`(fp_sync_status IS NULL OR fp_sync_status = 'failed')`);
    }
    if (site_code) {
      conditions.push(`site_code = $${i++}`);
      params.push(site_code);
    }
    if (chiller_id) {
      conditions.push(`chiller_id = $${i++}`);
      params.push(chiller_id);
    }
    if (reading_time_from) {
      conditions.push(`reading_time >= $${i++}`);
      params.push(reading_time_from);
    }
    if (reading_time_to) {
      conditions.push(`reading_time <= $${i++}`);
      params.push(reading_time_to);
    }

    const sql = `
      SELECT * FROM chiller_readings
      WHERE ${conditions.join(" AND ")}
      ORDER BY reading_time DESC NULLS LAST, created_at DESC
      LIMIT $${i}
    `;
    params.push(limit);

    const { query: rawQuery } = await import("@jouleops/shared");
    const rows = await rawQuery<any>(sql, params);

    if (dry_run) {
      return sendSuccess(res, {
        dry_run: true,
        candidates: rows.length,
        sample: rows.slice(0, 5).map((r) => ({
          id: r.id,
          site_code: r.site_code,
          chiller_id: r.chiller_id,
          log_id: r.log_id,
          fp_sync_status: r.fp_sync_status,
        })),
      });
    }

    const results: ManualChillerSyncResult[] = [];
    for (const row of rows) {
      const r = await syncSingleChillerReading(row);
      results.push(r);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "BACKFILL_FIELDPROXY_SYNC",
      module: "CHILLER_READING",
      description: `FP sync backfill processed ${summary.total} chiller reading rows`,
      metadata: { summary, filters: { site_code, chiller_id, reading_time_from, reading_time_to, only_failed, limit } },
    }).catch(() => {});

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Backfill complete — created ${summary.created}, updated ${summary.updated}, failed ${summary.failed}`,
      },
    );
  },
);

export default {
  create,
  getById,
  getAll,
  getBySite,
  getByChiller,
  getLatest,
  getByDateShift,
  update,
  remove,
  bulkRemove,
  getAverages,
  syncFieldproxySingle,
  syncFieldproxyBulk,
  backfillFpSync,
};
