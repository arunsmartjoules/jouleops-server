/**
 * Chiller Readings Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import chillerReadingsRepository from "../repositories/chillerReadingsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  asyncHandler,
} from "@jouleops/shared";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const reading = await chillerReadingsRepository.createChillerReading(
    req.body,
  );
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
    const { siteId, dateShift } = req.params;
    if (!siteId || !dateShift) {
      return sendError(res, "Site ID and Date Shift are required");
    }
    const readings = await chillerReadingsRepository.getReadingsByDateShift(
      siteId,
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
  return sendSuccess(res, null, {
    message: "Chiller reading deleted successfully",
  });
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
    req.params.siteId = "all";
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
  getAverages,
};
