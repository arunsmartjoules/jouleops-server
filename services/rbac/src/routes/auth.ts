import express from "express";
import authController from "../controllers/authController.ts";
import { verifyToken } from "../middleware/auth.ts";

import {
  validate,
  loginSchema,
  signupSchema,
  changePasswordSchema,
} from "@smartops/shared";

const router = express.Router();

/**
 * Auth Routes
 * Base path: /api/auth
 */

router.post("/login", validate(loginSchema), authController.login);
router.post("/signup", validate(signupSchema), authController.signup);
router.post("/reset-password", authController.resetPassword);
router.post("/logout", verifyToken, authController.logout);
router.post(
  "/change-password",
  verifyToken,
  validate(changePasswordSchema),
  authController.changePassword,
);
router.post("/refresh", authController.refreshToken);
router.get("/profile", verifyToken, authController.getProfile);

// Email verification routes
router.post("/send-verification", authController.sendVerificationCode);
router.post("/verify-code", authController.verifySignupCode);
router.post("/forgot-password", authController.sendPasswordResetCode);
router.post("/reset-password-with-code", authController.resetPasswordWithCode);

export default router;
