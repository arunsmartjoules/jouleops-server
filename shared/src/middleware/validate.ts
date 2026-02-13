import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { AppError } from "../utils/AppError.ts";

/**
 * validate
 *
 * Middleware factory that validates request data against a Zod schema.
 * Supports validating body, query, and params.
 *
 * Usage:
 * router.post("/", validate(mySchema), myController);
 * // validates req.body by default
 *
 * router.get("/:id", validate(mySchema, "params"), myController);
 */
export const validate = (
  schema: z.ZodTypeAny,
  source: "body" | "query" | "params" = "body",
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = await schema.parseAsync(req[source]);
      // Replace request data with validated/transformed data
      req[source] = data;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues
          .map((err: any) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        return next(new AppError(`Validation failed: ${message}`, 400));
      }
      next(error);
    }
  };
};
