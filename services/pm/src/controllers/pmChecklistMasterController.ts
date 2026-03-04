/**
 * PM Checklist Master Controller
 */

import pmChecklistMasterRepository from "../repositories/pmChecklistMasterRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

export const create = async (req: Request, res: Response) => {
  try {
    const entry = await pmChecklistMasterRepository.create(req.body);
    return sendCreated(res, entry);
  } catch (error: any) {
    console.error("Create PM checklist master error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "Checklist ID is required");
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const entry = await pmChecklistMasterRepository.getById(id, fieldArray);
    if (!entry) return sendNotFound(res, "Checklist Master");
    return sendSuccess(res, entry);
  } catch (error: any) {
    console.error("Get PM checklist master error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const entries = await pmChecklistMasterRepository.getAll(fieldArray);
    return sendSuccess(res, entries);
  } catch (error: any) {
    console.error("Get all PM checklist master error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "Checklist ID is required");
    const entry = await pmChecklistMasterRepository.update(id, req.body);
    return sendSuccess(res, entry);
  } catch (error: any) {
    console.error("Update PM checklist master error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "Checklist ID is required");
    const deleted = await pmChecklistMasterRepository.remove(id);
    if (!deleted) return sendNotFound(res, "Checklist Master");
    return sendSuccess(res, null, { message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Delete PM checklist master error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getAll,
  update,
  remove,
};
