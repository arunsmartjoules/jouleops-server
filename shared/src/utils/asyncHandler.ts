import type { Request, Response, NextFunction } from "express";

/**
 * asyncHandler
 *
 * Simple wrapper for Express route handlers that catches rejected promises
 * and passes them to the next middleware (error handler).
 *
 * Usage:
 * export const myController = asyncHandler(async (req, res) => {
 *   const data = await myRepository.getData();
 *   res.json({ success: true, data });
 * });
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
