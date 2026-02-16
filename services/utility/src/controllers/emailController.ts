import type { Request, Response } from "express";
import * as emailService from "../services/emailService.ts";
import { sendSuccess, sendError, sendServerError } from "@jouleops/shared";

/**
 * Email Controller
 */

export const sendVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email, type, userId } = req.body;
    if (!email || !type) {
      return sendError(res, "Email and type are required");
    }

    const code = emailService.generateVerificationCode();
    await emailService.storeVerificationCode(email, code, type, userId);
    await emailService.sendVerificationEmail(email, code, type);

    return sendSuccess(res, null, {
      message: "Verification code sent to your email",
    });
  } catch (error: any) {
    console.error("Send verification code error:", error);
    return sendServerError(res, error);
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return sendError(res, "Email and code are required");
    }

    const verification = await emailService.verifyCode(email, code);
    if (!verification) {
      return sendError(res, "Invalid or expired verification code");
    }

    return sendSuccess(res, verification);
  } catch (error: any) {
    console.error("Verify code error:", error);
    return sendServerError(res, error);
  }
};

export const deleteVerificationCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return sendError(res, "Email is required");
    }

    await emailService.deleteVerificationCode(email);
    return sendSuccess(res, null, { message: "Verification code deleted" });
  } catch (error: any) {
    console.error("Delete verification code error:", error);
    return sendServerError(res, error);
  }
};

export default {
  sendVerificationCode,
  verifyCode,
  deleteVerificationCode,
};
