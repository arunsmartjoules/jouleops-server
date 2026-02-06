import { describe, expect, it, jest, mock } from "bun:test";
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendServerError,
  sendCreated,
} from "./apiResponse";

describe("apiResponse helpers", () => {
  const mockResponse = () => {
    const res: any = {};
    res.status = mock(() => res);
    res.json = mock(() => res);
    return res;
  };

  describe("sendSuccess", () => {
    it("should send a default success response with 200 status", () => {
      const res = mockResponse();
      const data = { id: 1 };

      sendSuccess(res, data);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1 },
      });
    });

    it("should include message and pagination when provided", () => {
      const res = mockResponse();
      const data = [1, 2];
      const pagination = { page: 1, limit: 10, total: 2, totalPages: 1 };

      sendSuccess(res, data, { message: "Loaded", pagination });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [1, 2],
        message: "Loaded",
        pagination,
      });
    });
  });

  describe("sendError", () => {
    it("should send an error response with default 400 status", () => {
      const res = mockResponse();

      sendError(res, "Invalid input");

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid input",
      });
    });

    it("should include code and details when provided", () => {
      const res = mockResponse();

      sendError(res, "Conflict", {
        status: 409,
        code: "CONFLICT",
        details: { field: "email" },
      });

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Conflict",
        code: "CONFLICT",
        details: { field: "email" },
      });
    });
  });

  describe("fixed status helpers", () => {
    it("sendNotFound should use 404", () => {
      const res = mockResponse();
      sendNotFound(res, "User");
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "User not found",
        code: "NOT_FOUND",
      });
    });

    it("sendUnauthorized should use 401", () => {
      const res = mockResponse();
      sendUnauthorized(res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      });
    });

    it("sendForbidden should use 403", () => {
      const res = mockResponse();
      sendForbidden(res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Forbidden",
        code: "FORBIDDEN",
      });
    });

    it("sendServerError should use 500", () => {
      const res = mockResponse();
      sendServerError(res, "Database failed");
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Database failed",
        code: "SERVER_ERROR",
      });
    });

    it("sendCreated should use 201", () => {
      const res = mockResponse();
      sendCreated(res, { id: 1 }, "User created");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1 },
        message: "User created",
      });
    });
  });
});
