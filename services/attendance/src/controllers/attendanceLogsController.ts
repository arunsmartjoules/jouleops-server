/**
 * Attendance Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import attendanceRepository from "../repositories/attendanceRepository.ts";
import type { Request, Response } from "express";
import {
  parseCoord,
  computeSitesWithDistance,
  pickResolvedInRangeSite,
  toNearestSitePayload,
  type SiteDistanceRow,
} from "../geofenceUtils.ts";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendServerError,
  logActivity,
} from "@jouleops/shared";
import {
  forwardPunchInToFieldproxy,
  updateCheckOutInFieldproxy,
} from "../services/fieldproxyService.ts";

interface AuthRequest extends Request {
  user?: {
    user_id?: string;
    id?: string;
    email?: string;
    role?: string;
    is_superadmin?: boolean;
    /** Original Supabase UUID preserved after DB user_id resolution */
    supabase_id?: string;
  };
}

const isAdmin = (user: AuthRequest["user"]) => {
  return (
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.is_superadmin === true
  );
};

const getUserId = (user: AuthRequest["user"]) => {
  return user?.user_id || user?.id;
};

/**
 * Check if the requesting user is authorized to access the given userId's data.
 * Allows access if: admin, userId matches JWT user_id/id, userId matches the
 * original Supabase UUID (supabase_id), or userId maps to the same DB user via email.
 */
const isAuthorized = async (user: AuthRequest["user"], userId: string): Promise<boolean> => {
  if (isAdmin(user)) return true;
  if (userId === getUserId(user)) return true;
  // Check against original Supabase UUID (before DB user_id resolution)
  if (user?.supabase_id && userId === user.supabase_id) return true;
  // Fallback: look up DB user_id by email
  if (user?.email) {
    const dbUser = await attendanceRepository.getUserByEmail(user.email).catch(() => null);
    if (dbUser && (dbUser.user_id === userId || dbUser.user_id === getUserId(user))) return true;
  }
  return false;
};

export const create = async (req: Request, res: Response) => {
  try {
    const log = await attendanceRepository.checkIn(req.body);
    
    // Forward to Fieldproxy — fire and forget
    forwardPunchInToFieldproxy(log)
      .then(({ response: fpResponse, punch_id }) => {
        // Save punch_id back to our DB for checkout reference
        attendanceRepository.updateAttendanceLog(log.id, { fieldproxy_punch_id: punch_id }).catch(() => {});
        logActivity({
          user_id: log.user_id,
          action: "FORWARD_TO_FIELDPROXY",
          module: "attendance",
          description: `Attendance punch_in for ${log.user_id} forwarded to Fieldproxy (punch_id: ${punch_id})`,
          metadata: { attendance_id: log.id, user_id: log.user_id, punch_id, fieldproxy_response: fpResponse },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("Fieldproxy punch_in sync failed:", err);
        logActivity({
          user_id: log.user_id,
          action: "FORWARD_TO_FIELDPROXY_FAILED",
          module: "attendance",
          description: `Failed to forward attendance for ${log.user_id} to Fieldproxy`,
          metadata: { attendance_id: log.id, error: err.message },
        }).catch(() => {});
      });

    return sendCreated(res, log);
  } catch (error: any) {
    console.error("Create attendance log error:", error);
    return sendServerError(res, error);
  }
};

export const checkIn = async (req: AuthRequest, res: Response) => {
  try {
    let { user_id } = req.body;
    const { site_code, latitude, longitude, address, shift_id } = req.body;

    const user = req.user;
    if (!isAdmin(user) || !user_id) {
      user_id = getUserId(user);
    }

    if (!user_id) {
      return sendError(res, "user_id is required");
    }

    // Check if there's an active (not checked out) attendance for today
    const existing = await attendanceRepository.getTodayAttendance(user_id);
    if (existing && !existing.check_out_time) {
      // User has an active punch-in without checkout
      return res.status(400).json({
        success: false,
        error: "Please check out from your current session before checking in again",
        data: existing,
        requiresCheckout: true,
      });
    }

    const workLocationType =
      await attendanceRepository.getUserWorkLocationType(user_id);
    const isWFH = workLocationType === "WFH";

    const lat = parseCoord(latitude);
    const lon = parseCoord(longitude);

    const allSites =
      await attendanceRepository.getAllActiveSitesWithCoordinates();

    let siteCodeForDb: string | null;

    if (!isWFH) {
      if (lat === null || lon === null) {
        return res.status(400).json({
          success: false,
          error:
            "Latitude and longitude are required for check-in when you are not on Work From Home",
        });
      }
      if (allSites.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            "No active sites with coordinates are configured. Contact your administrator.",
        });
      }
      const ranked = computeSitesWithDistance(lat, lon, allSites);
      const resolved = pickResolvedInRangeSite(ranked);
      if (!resolved) {
        return res.status(400).json({
          success: false,
          error: "You are not within range of any active site",
          nearestSite: toNearestSitePayload(ranked[0]),
          userLocation: { latitude: lat, longitude: lon },
        });
      }
      const clientCode =
        site_code !== undefined && site_code !== null && String(site_code).trim() !== ""
          ? String(site_code).trim()
          : null;
      if (
        clientCode &&
        clientCode.toUpperCase() !== "WFH" &&
        clientCode !== resolved.site_code
      ) {
        return res.status(400).json({
          success: false,
          error: "Selected site does not match your GPS location",
          nearestSite: toNearestSitePayload(ranked[0]),
          userLocation: { latitude: lat, longitude: lon },
        });
      }
      siteCodeForDb = resolved.site_code;
    } else {
      if (lat !== null && lon !== null && allSites.length > 0) {
        const ranked = computeSitesWithDistance(lat, lon, allSites);
        const resolved = pickResolvedInRangeSite(ranked);
        siteCodeForDb = resolved ? resolved.site_code : null;
      } else {
        siteCodeForDb = null;
      }
    }

    const log = await attendanceRepository.checkIn({
      user_id,
      site_code: siteCodeForDb,
      latitude: lat ?? undefined,
      longitude: lon ?? undefined,
      address,
      shift_id,
    });

    // Forward to Fieldproxy — fire and forget
    forwardPunchInToFieldproxy(log)
      .then(({ response: fpResponse, punch_id }) => {
        // Save punch_id back to our DB for checkout reference
        attendanceRepository.updateAttendanceLog(log.id, { fieldproxy_punch_id: punch_id }).catch(() => {});
        logActivity({
          user_id: log.user_id,
          action: "FORWARD_TO_FIELDPROXY",
          module: "attendance",
          description: `Attendance punch_in for ${log.user_id} forwarded to Fieldproxy (punch_id: ${punch_id})`,
          metadata: { attendance_id: log.id, user_id: log.user_id, punch_id, fieldproxy_response: fpResponse },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("Fieldproxy punch_in sync failed:", err);
        logActivity({
          user_id: log.user_id,
          action: "FORWARD_TO_FIELDPROXY_FAILED",
          module: "attendance",
          description: `Failed to forward attendance for ${log.user_id} to Fieldproxy`,
          metadata: { attendance_id: log.id, error: err.message },
        }).catch(() => {});
      });

    return sendCreated(res, log, "Checked in successfully");
  } catch (error: any) {
    console.error("Check in error:", error);
    return sendServerError(res, error);
  }
};

export const checkOut = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, address, remarks } = req.body;
    const { id } = req.params;

    if (!id) {
      return sendError(res, "Attendance ID is required");
    }

    const existing = await attendanceRepository.getAttendanceById(id);
    if (!existing) {
      return sendNotFound(res, "Attendance record");
    }

    const user = req.user;
    if (!isAdmin(user) && existing.user_id !== getUserId(user)) {
      return sendForbidden(res, "Unauthorized to check out for this user");
    }

    // Calculate hours worked
    const checkInTime = new Date(existing.check_in_time!);
    const checkOutTime = new Date();
    const hoursWorked =
      (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    if (hoursWorked < 7 && !remarks) {
      return res.status(400).json({
        success: false,
        error: "Early checkout requires a reason",
        isEarlyCheckout: true,
        hoursWorked: hoursWorked.toFixed(2),
      });
    }

    const plat = parseCoord(latitude);
    const plon = parseCoord(longitude);
    const log = await attendanceRepository.checkOut(id, {
      latitude: plat === null ? undefined : plat,
      longitude: plon === null ? undefined : plon,
      address,
      remarks,
    });

    // Forward to Fieldproxy — fire and forget (upsert: creates FP row if punch_in sync was missed)
    syncAttendanceToFieldproxy(log)
      .then((syncResult) => {
        logActivity({
          user_id: log.user_id,
          action: syncResult.action === "failed"
            ? "UPDATE_FIELDPROXY_FAILED"
            : "UPDATE_FIELDPROXY",
          module: "attendance",
          description: syncResult.action === "failed"
            ? `Fieldproxy sync failed for checkout ${log.user_id}: ${syncResult.error}`
            : `Attendance checkout for ${log.user_id} ${syncResult.action} in Fieldproxy`,
          metadata: { attendance_id: log.id, user_id: log.user_id, action: syncResult.action, error: syncResult.error },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("Fieldproxy punch_out sync failed:", err);
        logActivity({
          user_id: log.user_id,
          action: "UPDATE_FIELDPROXY_FAILED",
          module: "attendance",
          description: `Failed to update attendance checkout for ${log.user_id} in Fieldproxy`,
          metadata: { attendance_id: log.id, error: err.message },
        }).catch(() => {});
      });

    return res.json({
      success: true,
      data: log,
      message: "Checked out successfully",
      hoursWorked: hoursWorked.toFixed(2),
      isEarlyCheckout: hoursWorked < 7,
    });
  } catch (error: any) {
    console.error("Check out error:", error);
    return sendServerError(res, error);
  }
};

export const validateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }
    const { latitude, longitude } = req.query;

    const user = req.user;
    if (!await isAuthorized(user, userId)) {
      return sendForbidden(res, "Unauthorized");
    }

    const workLocationType =
      await attendanceRepository.getUserWorkLocationType(userId);
    const isWFH = workLocationType === "WFH";

    const lat = parseCoord(latitude);
    const lon = parseCoord(longitude);

    const allSites =
      await attendanceRepository.getAllActiveSitesWithCoordinates();

    let ranked: SiteDistanceRow[] = [];
    if (lat !== null && lon !== null && allSites.length > 0) {
      ranked = computeSitesWithDistance(lat, lon, allSites);
    }

    const nearestRow = ranked[0] ?? null;
    const nearestSite = toNearestSitePayload(nearestRow);
    const inRangeRows = ranked.filter((s) => s.isWithinRange);
    const allowedSites = inRangeRows.map((s) => toNearestSitePayload(s)!);

    let isValid: boolean;
    let resolvedSiteCode: string | null;
    let message: string;

    if (isWFH) {
      isValid = true;
      resolvedSiteCode = pickResolvedInRangeSite(ranked)?.site_code ?? null;
      if (lat === null || lon === null) {
        message =
          "Work From Home: you can check in without being at a site. Enable location to record a site when you are on premises.";
      } else if (resolvedSiteCode) {
        message = "Work From Home: you are within an active site geofence.";
      } else {
        message = "Work From Home enabled";
      }
    } else {
      if (lat === null || lon === null) {
        isValid = false;
        resolvedSiteCode = null;
        message =
          "Latitude and longitude are required for site attendance. Enable location and try again.";
      } else if (allSites.length === 0) {
        isValid = false;
        resolvedSiteCode = null;
        message =
          "No active sites with coordinates are configured. Contact your administrator.";
      } else {
        resolvedSiteCode = pickResolvedInRangeSite(ranked)?.site_code ?? null;
        isValid = inRangeRows.length > 0;
        message = isValid
          ? "Location validated"
          : "You are not within range of any active site";
      }
    }

    return sendSuccess(res, {
      isValid,
      isWFH,
      allowedSites,
      nearestSite,
      resolvedSiteCode,
      userLocation:
        lat !== null && lon !== null
          ? { latitude: lat, longitude: lon }
          : null,
      message,
    });
  } catch (error: any) {
    console.error("Validate location error:", error);
    return sendServerError(res, error);
  }
};

export const getUserSites = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { project_type } = req.query;

    if (!userId) {
      return sendError(res, "User ID is required");
    }

    const user = req.user;
    if (!await isAuthorized(user, userId)) {
      return sendForbidden(res, "Unauthorized");
    }

    const sites = await attendanceRepository.getUserSitesWithCoordinates(
      userId,
      project_type as string | undefined,
    );
    return sendSuccess(res, sites);
  } catch (error: any) {
    console.error("Get user sites error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Attendance ID is required");
    }
    const log = await attendanceRepository.getAttendanceById(id);
    if (!log) {
      return sendNotFound(res, "Attendance log");
    }

    if (!await isAuthorized(req.user, log.user_id)) {
      return sendForbidden(res, "Unauthorized");
    }

    return sendSuccess(res, log);
  } catch (error: any) {
    console.error("Get attendance log error:", error);
    return sendServerError(res, error);
  }
};

export const getTodayByUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }

    if (!await isAuthorized(req.user, userId)) {
      return sendForbidden(res, "Unauthorized");
    }

    const log = await attendanceRepository.getTodayAttendance(userId);
    return sendSuccess(res, log);
  } catch (error: any) {
    console.error("Get today attendance error:", error);
    return sendServerError(res, error);
  }
};

export const getByUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }

    if (!await isAuthorized(req.user, userId)) {
      return sendForbidden(res, "Unauthorized");
    }

    const { page, limit, date_from, date_to } = req.query;
    const result = await attendanceRepository.getAttendanceByUser(userId, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 30,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get attendance error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { date, status } = req.query;
    const logs = await attendanceRepository.getAttendanceBySite(siteCode, {
      date: date as string | undefined,
      status: status as string | undefined,
    });
    return sendSuccess(res, logs);
  } catch (error: any) {
    console.error("Get attendance error:", error);
    return sendServerError(res, error);
  }
};

export const getReport = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return sendError(res, "date_from and date_to are required");
    }

    const report = await attendanceRepository.getAttendanceReport(
      siteCode,
      date_from as string,
      date_to as string,
    );
    return sendSuccess(res, report);
  } catch (error: any) {
    console.error("Get attendance report error:", error);
    return sendServerError(res, error);
  }
};

export const getOverallReport = async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, site_code } = req.query;
    if (!date_from || !date_to) {
      return sendError(res, "date_from and date_to are required");
    }

    const report = await attendanceRepository.getAttendanceReport(
      (site_code as string) || null,
      date_from as string,
      date_to as string,
    );
    return sendSuccess(res, report);
  } catch (error: any) {
    console.error("Get overall attendance report error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Attendance ID is required");
    }
    const existing = await attendanceRepository.getAttendanceById(id);
    if (!existing) {
      return sendNotFound(res, "Attendance log");
    }

    const log = await attendanceRepository.updateAttendanceLog(id, req.body);
    
    // Sync with Fieldproxy — fire and forget (upsert: creates FP row if missing)
    syncAttendanceToFieldproxy(log)
      .then((syncResult) => {
        logActivity({
          user_id: log.user_id,
          action: syncResult.action === "failed"
            ? "UPDATE_FIELDPROXY_FAILED"
            : "UPDATE_FIELDPROXY",
          module: "attendance",
          description: syncResult.action === "failed"
            ? `Fieldproxy sync failed for update ${log.user_id}: ${syncResult.error}`
            : `Attendance update for ${log.user_id} ${syncResult.action} in Fieldproxy`,
          metadata: { attendance_id: log.id, user_id: log.user_id, action: syncResult.action, error: syncResult.error },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("Fieldproxy update sync failed:", err);
        logActivity({
          user_id: log.user_id,
          action: "UPDATE_FIELDPROXY_FAILED",
          module: "attendance",
          description: `Failed to sync attendance update for ${log.user_id} in Fieldproxy`,
          metadata: { attendance_id: log.id, error: err.message },
        }).catch(() => {});
      });

    return sendSuccess(res, log);
  } catch (error: any) {
    console.error("Update attendance log error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Attendance ID is required");
    }
    const existing = await attendanceRepository.getAttendanceById(id);
    if (!existing) {
      return sendNotFound(res, "Attendance log");
    }

    await attendanceRepository.deleteAttendanceLog(id);
    return sendSuccess(res, null, {
      message: "Attendance log deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete attendance log error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit, date_from, date_to, status, site_code } = req.query;
    const result = await attendanceRepository.getAllAttendance({
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 30,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      status: status as string | undefined,
      site_code: site_code as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get all attendance error:", error);
    return sendServerError(res, error);
  }
};

export const bulkUpsert = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user)) {
      return sendForbidden(res, "Only admins can bulk import attendance");
    }

    const { attendance } = req.body;
    if (!Array.isArray(attendance) || attendance.length === 0) {
      return sendError(res, "No attendance data provided");
    }

    const { count } =
      await attendanceRepository.bulkUpsertAttendance(attendance);

    return sendSuccess(
      res,
      { count },
      { message: `Successfully imported ${count} attendance logs` },
    );
  } catch (error: any) {
    console.error("Bulk upsert attendance error:", error);
    return sendServerError(res, error);
  }
};

/**
 * Sync a single attendance record to Fieldproxy.
 * If fieldproxy_punch_id exists, updates the existing row.
 * Otherwise, creates a new row and saves the punch_id back.
 */
export const syncFieldproxySingle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Attendance ID is required");
    }

    const log = await attendanceRepository.getAttendanceById(id);
    if (!log) {
      return sendNotFound(res, "Attendance record");
    }

    logActivity({
      user_id: req.user?.user_id || req.user?.id,
      action: "MANUAL_FIELDPROXY_SYNC_START",
      module: "attendance",
      description: `Manual Fieldproxy sync started for attendance ${id}`,
      metadata: { attendance_id: id, mode: "single" },
    }).catch(() => {});

    const result = await syncAttendanceToFieldproxy(log);

    logActivity({
      user_id: req.user?.user_id || req.user?.id,
      action: result.action === "failed"
        ? "MANUAL_FIELDPROXY_SYNC_FAILED"
        : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
      module: "attendance",
      description: result.action === "failed"
        ? `Manual Fieldproxy sync failed for attendance ${id}`
        : `Manual Fieldproxy sync ${result.action} for attendance ${id}`,
      metadata: { attendance_id: id, mode: "single", action: result.action, error: result.error },
    }).catch(() => {});

    if (result.action === "failed") {
      return sendError(res, result.error || "Fieldproxy sync failed");
    }

    return sendSuccess(res, result, {
      message: `Fieldproxy sync ${result.action} for attendance ${id}`,
    });
  } catch (error: any) {
    console.error("Sync Fieldproxy single error:", error);
    return sendServerError(res, error);
  }
};

/**
 * Bulk sync attendance records to Fieldproxy.
 */
export const syncFieldproxyBulk = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "ids array is required");
    }

    const uniqueIds = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
    const results: { attendance_id: string; action: string; error?: string }[] = [];

    for (const id of uniqueIds) {
      const log = await attendanceRepository.getAttendanceById(id);
      if (!log) {
        results.push({ attendance_id: id, action: "failed", error: "Attendance record not found" });
        continue;
      }

      const result = await syncAttendanceToFieldproxy(log);
      results.push({ attendance_id: id, ...result });

      logActivity({
        user_id: req.user?.user_id || req.user?.id,
        action: result.action === "failed"
          ? "MANUAL_FIELDPROXY_SYNC_FAILED"
          : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
        module: "attendance",
        description: result.action === "failed"
          ? `Bulk manual Fieldproxy sync failed for attendance ${id}`
          : `Bulk manual Fieldproxy sync ${result.action} for attendance ${id}`,
        metadata: { attendance_id: id, mode: "bulk", action: result.action, error: result.error },
      }).catch(() => {});
    }

    const summary = {
      total: results.length,
      updated: results.filter((r) => r.action === "updated").length,
      created: results.filter((r) => r.action === "created").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Fieldproxy bulk sync completed: updated ${summary.updated}, created ${summary.created}, failed ${summary.failed}`,
      },
    );
  } catch (error: any) {
    console.error("Sync Fieldproxy bulk error:", error);
    return sendServerError(res, error);
  }
};

/**
 * Helper: sync a single attendance log to Fieldproxy (upsert pattern).
 * If fieldproxy_punch_id exists, update; otherwise create new.
 */
async function syncAttendanceToFieldproxy(
  log: any,
): Promise<{ action: "updated" | "created" | "failed"; error?: string }> {
  try {
    if (log.fieldproxy_punch_id) {
      // Try updating existing row
      const updateResult = await updateCheckOutInFieldproxy(log);
      if (updateResult.update) {
        return { action: "updated" };
      }
      if (updateResult.error) {
        // Row not found in FP — fall through to create
        if (updateResult.error.toLowerCase().includes("row not found")) {
          // Fall through to create below
        } else {
          return { action: "failed", error: updateResult.error };
        }
      }
    }

    // Create new row in Fieldproxy (with both punch_in and punch_out if available)
    const { punch_id } = await forwardPunchInToFieldproxy(log);

    // Save the fieldproxy_punch_id back to our DB
    await attendanceRepository.updateAttendanceLog(log.id, {
      fieldproxy_punch_id: punch_id,
    });

    // If there's a check_out_time, also update the FP row with checkout data
    if (log.check_out_time) {
      const logWithFpId = { ...log, fieldproxy_punch_id: punch_id };
      await updateCheckOutInFieldproxy(logWithFpId).catch((err) => {
        console.warn(`[FIELDPROXY] Created row but failed to update checkout: ${err.message}`);
      });
    }

    return { action: "created" };
  } catch (error: any) {
    return { action: "failed", error: error.message || "Failed to sync to Fieldproxy" };
  }
}

export default {
  create,
  checkIn,
  checkOut,
  getById,
  getTodayByUser,
  getByUser,
  getBySite,
  getReport,
  getOverallReport,
  update,
  remove,
  validateLocation,
  getUserSites,
  getAll,
  bulkUpsert,
  syncFieldproxySingle,
  syncFieldproxyBulk,
};
