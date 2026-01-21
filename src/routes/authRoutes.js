import express from "express";
import authController from "../controllers/authController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * Auth Routes
 * Base path: /api/auth
 */

router.post("/login", authController.login);
router.post("/signup", authController.signup);
router.post("/reset-password", authController.resetPassword);
router.post("/logout", verifyToken, authController.logout);
router.post("/change-password", verifyToken, authController.changePassword);
router.post("/refresh", authController.refreshToken);
router.get("/profile", verifyToken, authController.getProfile);

// Email verification routes
router.post("/send-verification", authController.sendVerificationCode);
router.post("/verify-code", authController.verifySignupCode);
router.post("/forgot-password", authController.sendPasswordResetCode);
router.post("/reset-password-with-code", authController.resetPasswordWithCode);

export default router;
