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
} from "@jouleops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id?: string;
    id?: string;
    role?: string;
    is_superadmin?: boolean;
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

export const create = async (req: Request, res: Response) => {
  try {
    const log = await attendanceRepository.checkIn(req.body);
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

    // Check if already checked in today
    const existing = await attendanceRepository.getTodayAttendance(user_id);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Already checked in today",
        data: existing,
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
    if (!isAdmin(user) && userId !== getUserId(user)) {
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
    if (!isAdmin(user) && userId !== getUserId(user)) {
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

    const user = req.user;
    if (!isAdmin(user) && log.user_id !== getUserId(user)) {
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

    const user = req.user;
    if (!isAdmin(user) && userId !== getUserId(user)) {
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

    const user = req.user;
    if (!isAdmin(user) && userId !== getUserId(user)) {
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
    const { page, limit, date_from, date_to, status } = req.query;
    const result = await attendanceRepository.getAllAttendance({
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 30,
      date_from: date_from as string | undefined,
      date_to: date_to as string | undefined,
      status: status as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get all attendance error:", error);
    return sendServerError(res, error);
  }
};

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
};
