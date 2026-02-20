/**
 * Complaint Category Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import complaintCategoryRepository from "../repositories/complaintCategoryRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

export const getAll = async (req: Request, res: Response) => {
  try {
    const categories = await complaintCategoryRepository.getAllCategories();
    return sendSuccess(res, categories);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Category ID is required");
    }
    const category = await complaintCategoryRepository.getCategoryById(id);

    if (!category) {
      return sendNotFound(res, "Category");
    }

    return sendSuccess(res, category);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const { category } = req.body;

    if (!category) {
      return sendError(res, "Category name is required");
    }

    const newCategory = await complaintCategoryRepository.createCategory({
      category,
    });

    return sendCreated(res, newCategory);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Category ID is required");
    }
    const { category } = req.body;

    const updatedCategory = await complaintCategoryRepository.updateCategory(
      id,
      {
        category,
      },
    );

    return sendSuccess(res, updatedCategory);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Category ID is required");
    }
    await complaintCategoryRepository.deleteCategory(id);

    return sendSuccess(res, null, { message: "Category deleted successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export default {
  getAll,
  getById,
  create,
  update,
  remove,
};
