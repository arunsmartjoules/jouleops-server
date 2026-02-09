import express from "express";
import emailController from "../controllers/emailController.ts";

const router = express.Router();

/**
 * Email Routes
 * Base path: /api/email
 */

// Verification routes
router.post("/verification-code/send", emailController.sendVerificationCode);
router.post("/verification-code/verify", emailController.verifyCode);
router.post(
  "/verification-code/delete",
  emailController.deleteVerificationCode,
);

export default router;
