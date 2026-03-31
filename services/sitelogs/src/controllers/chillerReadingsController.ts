/**
 * Chiller Readings Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import chillerReadingsRepository from "../repositories/chillerReadingsRepository.ts";
import {
  createChillerReadingInFieldproxy,
  updateChillerReadingInFieldproxy,
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
    .then((fp) => {
      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action: "SYNC_TO_FIELDPROXY",
        module: "CHILLER_READING",
        description: `Created chiller reading ${reading.id} in Fieldproxy`,
        metadata: { readingId: reading.id, fieldproxy: fp },
      }).catch(() => {});
    })
    .catch((err) => {
      console.error("[FIELDPROXY] chiller reading create sync failed:", err);
      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action: "SYNC_TO_FIELDPROXY_FAILED",
        module: "CHILLER_READING",
        description: `Failed to create chiller reading ${reading.id} in Fieldproxy`,
        metadata: { readingId: reading.id, error: err.message },
      }).catch(() => {});
    });

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
      .then((fp) => {
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY",
          module: "CHILLER_READING",
          description: `Updated chiller reading ${id} in Fieldproxy`,
          metadata: { readingId: id, log_id: reading.log_id, fieldproxy: fp },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("[FIELDPROXY] chiller reading update sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "CHILLER_READING",
          description: `Failed to update chiller reading ${id} in Fieldproxy`,
          metadata: { readingId: id, error: err.message },
        }).catch(() => {});
      });
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
};
