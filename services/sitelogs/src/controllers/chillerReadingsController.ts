/**
 * Chiller Readings Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import chillerReadingsRepository from "../repositories/chillerReadingsRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@smartops/shared";

export const create = async (req: Request, res: Response) => {
  try {
    const reading = await chillerReadingsRepository.createChillerReading(
      req.body,
    );
    return sendCreated(res, reading);
  } catch (error: any) {
    console.error("Create chiller reading error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "ID is required");
    }
    const reading = await chillerReadingsRepository.getChillerReadingById(
      parseInt(id),
    );
    if (!reading) {
      return sendNotFound(res, "Chiller reading");
    }
    return sendSuccess(res, reading);
  } catch (error: any) {
    console.error("Get chiller reading error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const { page, limit, chiller_id, date_from, date_to, sortBy, sortOrder } =
      req.query;
    const result = await chillerReadingsRepository.getChillerReadingsBySite(
      siteId,
      {
        page: parseInt(page as string) || 1,
        limit: parseInt(limit as string) || 20,
        chiller_id: chiller_id as string | undefined,
        date_from: date_from as string | undefined,
        date_to: date_to as string | undefined,
        sortBy: sortBy as string | undefined,
        sortOrder: sortOrder as "asc" | "desc" | undefined,
      },
    );
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get chiller readings error:", error);
    return sendServerError(res, error);
  }
};

export const getByChiller = async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    console.error("Get chiller readings error:", error);
    return sendServerError(res, error);
  }
};

export const getLatest = async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    console.error("Get latest reading error:", error);
    return sendServerError(res, error);
  }
};

export const getByDateShift = async (req: Request, res: Response) => {
  try {
    const { siteId, dateShift } = req.params;
    if (!siteId || !dateShift) {
      return sendError(res, "Site ID and Date Shift are required");
    }
    const readings = await chillerReadingsRepository.getReadingsByDateShift(
      siteId,
      dateShift,
    );
    return sendSuccess(res, readings);
  } catch (error: any) {
    console.error("Get readings error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "ID is required");
    }
    const existing = await chillerReadingsRepository.getChillerReadingById(
      parseInt(id),
    );
    if (!existing) {
      return sendNotFound(res, "Chiller reading");
    }

    const reading = await chillerReadingsRepository.updateChillerReading(
      parseInt(id),
      req.body,
    );
    return sendSuccess(res, reading);
  } catch (error: any) {
    console.error("Update chiller reading error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "ID is required");
    }
    const existing = await chillerReadingsRepository.getChillerReadingById(
      parseInt(id),
    );
    if (!existing) {
      return sendNotFound(res, "Chiller reading");
    }

    await chillerReadingsRepository.deleteChillerReading(parseInt(id));
    return sendSuccess(res, null, {
      message: "Chiller reading deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete chiller reading error:", error);
    return sendServerError(res, error);
  }
};

export const getAverages = async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    console.error("Get averages error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  req.params.siteId = "all";
  return getBySite(req, res);
};

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
  getAverages,
};
