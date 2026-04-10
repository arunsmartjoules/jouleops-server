/**
 * Attendance Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import attendanceRepository from "../repositories/attendanceRepository.ts";
import type { Request, Response } from "express";
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

    if (!user_id || !site_code) {
      return sendError(res, "user_id and site_code are required");
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

    // Validate location if coordinates provided
    if (latitude && longitude) {
      const userSites =
        await attendanceRepository.getUserSitesWithCoordinates(user_id);
      const workLocationType =
        await attendanceRepository.getUserWorkLocationType(user_id);

      if (workLocationType !== "WFH" && userSites.length > 0) {
        // Find if user is within range of site
        const matchingSite = userSites.find((s) => {
          if (!s.latitude || !s.longitude) return false;
          const distance = attendanceRepository.calculateDistance(
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(s.latitude),
            parseFloat(s.longitude),
          );
          return distance <= (s.radius || 200);
        });

        if (!matchingSite && site_code !== "WFH") {
          return res.status(400).json({
            success: false,
            error: "You are not within range of any assigned site",
            allowedSites: userSites,
          });
        }
      }
    }

    const siteCodeForDb = site_code === "WFH" ? null : site_code;

    const log = await attendanceRepository.checkIn({
      user_id,
      site_code: siteCodeForDb!,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
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

    const log = await attendanceRepository.checkOut(id, {
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      address,
      remarks,
    });

    // Forward to Fieldproxy — fire and forget
    updateCheckOutInFieldproxy(log)
      .then((syncResult) => {
        logActivity({
          user_id: log.user_id,
          action: "LOOKUP_FIELDPROXY",
          module: "attendance",
          description: `Fieldproxy lookup for attendance checkout ${log.user_id}`,
          metadata: { attendance_id: log.id, user_id: log.user_id, fieldproxy_response: syncResult.lookup },
        }).catch(() => {});

        if (syncResult.update) {
          logActivity({
            user_id: log.user_id,
            action: "UPDATE_FIELDPROXY",
            module: "attendance",
            description: `Attendance checkout for ${log.user_id} updated in Fieldproxy successfully`,
            metadata: { attendance_id: log.id, user_id: log.user_id, fieldproxy_response: syncResult.update },
          }).catch(() => {});
        } else if (syncResult.error) {
          logActivity({
            user_id: log.user_id,
            action: "UPDATE_FIELDPROXY_FAILED",
            module: "attendance",
            description: `Fieldproxy update for attendance checkout ${log.user_id} skipped: ${syncResult.error}`,
            metadata: { attendance_id: log.id, error: syncResult.error, lookup_response: syncResult.lookup },
          }).catch(() => {});
        }
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
    const userSites =
      await attendanceRepository.getUserSitesWithCoordinates(userId);

    const isWFH = workLocationType === "WFH";
    let allowedSites: any[] = [];
    let nearestSite: any = null;

    if (!isWFH && latitude && longitude) {
      const lat = parseFloat(latitude as string);
      const lon = parseFloat(longitude as string);

      allowedSites = userSites
        .map((s) => {
          if (!s.latitude || !s.longitude) return null;
          const distance = attendanceRepository.calculateDistance(
            lat,
            lon,
            parseFloat(s.latitude),
            parseFloat(s.longitude),
          );
          return {
            ...s,
            distance,
            isWithinRange: distance <= (s.radius || 200),
          };
        })
        .filter((s) => s !== null)
        .sort((a, b) => a!.distance - b!.distance) as any[];

      nearestSite = allowedSites[0] || null;
    }

    const filteredAllowedSites = isWFH
      ? userSites
      : allowedSites.filter((s) => s.isWithinRange);

    const isValid = isWFH || filteredAllowedSites.length > 0;

    return sendSuccess(res, {
      isValid,
      isWFH,
      allowedSites: filteredAllowedSites,
      nearestSite,
      allSites: userSites,
      message: isValid
        ? isWFH
          ? "Work From Home enabled"
          : "Location validated"
        : "You are not within range of any assigned site",
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
    
    // Sync with Fieldproxy — fire and forget
    if (log.check_out_time) {
      updateCheckOutInFieldproxy(log)
        .then((syncResult) => {
          logActivity({
            user_id: log.user_id,
            action: "LOOKUP_FIELDPROXY",
            module: "attendance",
            description: `Fieldproxy lookup for attendance checkout ${log.user_id}`,
            metadata: { attendance_id: log.id, user_id: log.user_id, fieldproxy_response: syncResult.lookup },
          }).catch(() => {});

          if (syncResult.update) {
            logActivity({
              user_id: log.user_id,
              action: "UPDATE_FIELDPROXY",
              module: "attendance",
              description: `Attendance checkout for ${log.user_id} updated in Fieldproxy successfully`,
              metadata: { attendance_id: log.id, user_id: log.user_id, fieldproxy_response: syncResult.update },
            }).catch(() => {});
          } else if (syncResult.error) {
            logActivity({
              user_id: log.user_id,
              action: "UPDATE_FIELDPROXY_FAILED",
              module: "attendance",
              description: `Fieldproxy update for attendance checkout ${log.user_id} skipped: ${syncResult.error}`,
              metadata: { attendance_id: log.id, error: syncResult.error, lookup_response: syncResult.lookup },
            }).catch(() => {});
          }
        })
        .catch((err) => {
          console.error("Fieldproxy update sync failed:", err);
          logActivity({
            user_id: log.user_id,
            action: "UPDATE_FIELDPROXY_FAILED",
            module: "attendance",
            description: `Failed to update attendance checkout for ${log.user_id} in Fieldproxy`,
            metadata: { attendance_id: log.id, error: err.message },
          }).catch(() => {});
        });
    } else {
      forwardPunchInToFieldproxy(log)
        .then((fpResponse) => {
          logActivity({
            user_id: log.user_id,
            action: "FORWARD_TO_FIELDPROXY",
            module: "attendance",
            description: `Attendance punch_in for ${log.user_id} forwarded to Fieldproxy successfully`,
            metadata: { attendance_id: log.id, user_id: log.user_id, fieldproxy_response: fpResponse },
          }).catch(() => {});
        })
        .catch((err) => {
          console.error("Fieldproxy update sync failed:", err);
          logActivity({
            user_id: log.user_id,
            action: "FORWARD_TO_FIELDPROXY_FAILED",
            module: "attendance",
            description: `Failed to forward attendance for ${log.user_id} to Fieldproxy`,
            metadata: { attendance_id: log.id, error: err.message },
          }).catch(() => {});
        });
    }

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
