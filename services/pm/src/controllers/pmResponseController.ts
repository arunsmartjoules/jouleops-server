/**
 * PM Response Controller
 */

import pmResponseRepository from "../repositories/pmResponseRepository.ts";
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
    const response = await pmResponseRepository.create(req.body);
    return sendCreated(res, response);
  } catch (error: any) {
    console.error("Create PM response error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const response = await pmResponseRepository.getById(id, fieldArray);
    if (!response) return sendNotFound(res, "PM Response");
    return sendSuccess(res, response);
  } catch (error: any) {
    console.error("Get PM response error:", error);
    return sendServerError(res, error);
  }
};

export const getByInstance = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) return sendError(res, "Instance ID is required");
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const responses = await pmResponseRepository.getByInstance(
      instanceId,
      fieldArray,
    );
    return sendSuccess(res, responses);
  } catch (error: any) {
    console.error("Get PM responses error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const response = await pmResponseRepository.update(id, req.body);
    return sendSuccess(res, response);
  } catch (error: any) {
    console.error("Update PM response error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const deleted = await pmResponseRepository.remove(id);
    if (!deleted) return sendNotFound(res, "PM Response");
    return sendSuccess(res, null, { message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Delete PM response error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getByInstance,
  update,
  remove,
};
