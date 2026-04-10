/**
 * Auth Controller
 *
 * Handles authentication endpoints: login, signup, logout, password reset.
 * Uses direct PostgreSQL queries via repositories instead of Supabase SDK.
 * Standardized API responses via apiResponse helpers.
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response } from "express";

import usersRepository from "../repositories/usersRepository.ts";
import authRepository from "../repositories/authRepository.ts";
import { logActivity } from "../repositories/logsRepository.ts";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  asyncHandler,
  firebaseAdmin,
} from "@jouleops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    email: string;
    role: string;
  };
}

const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

function isSignupEmailAllowed(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;

  const allowlistedEmails = String(process.env.SIGNUP_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
  if (allowlistedEmails.includes(email)) return true;

  const allowlistedDomains = String(
    process.env.SIGNUP_ALLOWED_EMAIL_DOMAINS || "smartjoules.in",
  )
    .split(",")
    .map((value) => normalizeEmail(value).replace(/^@/, ""))
    .filter(Boolean);

  const domain = email.split("@")[1] || "";
  return allowlistedDomains.includes(domain);
}

// ============================================================================
// Login
// ============================================================================

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return sendError(res, "Email and password are required");
  }

  // Find user by email (uncached to get password)
  const user = await usersRepository.getUserByEmail(email);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Invalid email or password",
    });
  }

  // Check password
  if (!user.password) {
    return res.status(401).json({
      success: false,
      error: "Authentication not configured for this user",
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password!);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      error: "Invalid email or password",
    });
  }

  // Generate access token (now using Firebase)
  const is_admin =
    user.role === "Admin" ||
    user.role === "admin" ||
    user.is_superadmin ||
    false;
  const is_superadmin = user.is_superadmin || false;

  const token = await firebaseAdmin.auth().createCustomToken(user.user_id, {
    role: user.role,
    is_admin,
    is_superadmin,
    email: user.email,
  });

  const secret = (process.env.JWT_SECRET || "") as string;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  // Generate refresh token
  const newRefreshToken = jwt.sign(
    { user_id: user.user_id, type: "refresh" },
    (process.env.JWT_REFRESH_SECRET || secret) as string,
    { expiresIn: "60d" },
  );

  // Store refresh token
  await authRepository.storeRefreshToken({
    user_id: user.user_id,
    token: newRefreshToken,
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    device_info: req.headers["user-agent"] as string,
  });

  // Log successful login
  await logActivity({
    user_id: user.user_id,
    action: "LOGIN_SUCCESS",
    module: "AUTH",
    description: `User ${user.email} logged in`,
    ip_address: req.ip,
    device_info: req.headers["user-agent"] as string,
  });

  return sendSuccess(res, {
    token,
    refresh_token: newRefreshToken,
    expires_in: 604800,
    user: {
      id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_superadmin: user.is_superadmin || false,
      department: user.department,
      designation: user.designation,
      work_location_type: user.work_location_type,
    },
  });
});

// ============================================================================
// Signup
// ============================================================================

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, firebase_uid } = req.body;

  if (!email || !password || !name) {
    return sendError(res, "Email, password, and name are required");
  }

  if (!isSignupEmailAllowed(email)) {
    return sendError(
      res,
      "Signup is restricted to allowlisted company email addresses.",
    );
  }

  // Check if user already exists
  const existingUser = await usersRepository.getUserByEmail(email);

  if (existingUser && existingUser.password) {
    return sendError(res, "Account already registered. Please sign in.");
  }

  // Use provided firebase_uid or generate a new UUID
  const user_id = firebase_uid || uuidv4();

  // Hash password for our local DB fallback
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  let user: any;

  if (existingUser) {
    // Scenario A: User exists but has no password (Claiming)
    user = await usersRepository.updateUser(existingUser.user_id, {
      password: hashedPassword,
      name: name || existingUser.name,
      is_active: true,
    });
  } else {
    // Scenario B: Entirely new user (Registering)
    user = await usersRepository.createUser({
      user_id: user_id,
      email,
      password: hashedPassword,
      name,
      role: "staff",
      is_active: true,
    });
  }

  // Log detailed signup activity
  await logActivity({
    user_id: user.user_id,
    action: existingUser ? "SIGNUP_SYNC_CLAIM" : "SIGNUP_SYNC_REGISTER",
    module: "AUTH",
    description: `User ${user.email} synced from Firebase (${user.user_id})`,
    ip_address: req.ip,
    device_info: req.headers["user-agent"] as string,
  });

  // Modern Authentication: Use Firebase Admin SDK for createCustomToken
  const token = await firebaseAdmin.auth().createCustomToken(user.user_id, {
    role: user.role,
    is_admin:
      user.role === "Admin" ||
      user.role === "admin" ||
      user.is_superadmin ||
      false,
    is_superadmin: user.is_superadmin || false,
    email: user.email,
  });

  const secret = (process.env.JWT_SECRET || "") as string;
  // Generate refresh token
  const newRefreshToken = jwt.sign(
    { user_id: user.user_id, type: "refresh" },
    (process.env.JWT_REFRESH_SECRET || secret) as string,
    { expiresIn: "60d" },
  );

  // Store refresh token
  await authRepository.storeRefreshToken({
    user_id: user.user_id,
    token: newRefreshToken,
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    device_info: req.headers["user-agent"] as string,
  });

  // Log signup
  await logActivity({
    user_id: user.user_id,
    action: existingUser ? "SIGNUP_CLAIM" : "SIGNUP_REGISTER",
    module: "AUTH",
    description: `User ${user.email} ${existingUser ? "claimed account" : "registered"}`,
    ip_address: req.ip,
    device_info: req.headers["user-agent"] as string,
  });

  return sendCreated(res, {
    token,
    refresh_token: newRefreshToken,
    expires_in: 604800,
    user: {
      id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_superadmin: user.is_superadmin || false,
    },
  });
});

// ============================================================================
// Get Profile
// ============================================================================

export const getProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Resolve by email first to avoid identity-provider UUID mismatches.
    let user = req.user!.email
      ? await usersRepository.getUserByEmail(req.user!.email)
      : null;
    if (!user) {
      user = await usersRepository.getUserById(req.user!.user_id);
    }

    if (!user) {
      return sendNotFound(res, "User");
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return sendSuccess(res, userWithoutPassword);
  },
);

// ============================================================================
// Get Profile By Email (Public endpoint for Supabase auth fallback)
// ============================================================================

export const getProfileByEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return sendError(res, "Email is required");
    }

    // Fetch user profile by email
    const user = await usersRepository.getUserByEmail(email);

    if (!user) {
      return sendNotFound(res, "User");
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return sendSuccess(res, userWithoutPassword);
  },
);

// ============================================================================
// Logout
// ============================================================================

export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user) {
    await logActivity({
      user_id: req.user.user_id,
      action: "LOGOUT_SUCCESS",
      module: "AUTH",
      description: `User ${req.user.email} logged out`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    });
  }

  const { refresh_token } = req.body;
  if (refresh_token) {
    await authRepository.revokeRefreshToken(refresh_token);
  }

  // Blacklist access token if present
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    if (token) {
      const decoded: any = jwt.decode(token);
      if (decoded && decoded.jti && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await authRepository.blacklistToken(decoded.jti, expiresIn);
        }
      }
    }
  }

  return sendSuccess(res, null, { message: "Logged out successfully" });
});

// ============================================================================
// Change Password
// ============================================================================

export const changePassword = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!currentPassword || !newPassword) {
      return sendError(res, "Current password and new password are required");
    }

    if (newPassword.length < 6) {
      return sendError(res, "New password must be at least 6 characters");
    }

    // Get user with password
    const user = await usersRepository.getUserByIdUncached(userId);

    if (!user) {
      return sendNotFound(res, "User");
    }

    if (!user.password) {
      return sendError(res, "Password not set for this account");
    }

    // Verify current password, only if NOT authenticated natively via Firebase
    // If authenticated via Firebase, we implicitly trust the token 
    // and just want to sync the Postgres password to match Firebase.
    const isFirebase = (req.user as any)?.is_firebase;
    
    if (!isFirebase) {
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password!,
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          success: false,
          error: "Current password is incorrect",
        });
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await usersRepository.updateUser(userId, { password: hashedPassword });

    // Log password change
    await logActivity({
      user_id: userId,
      action: "PASSWORD_CHANGE",
      module: "AUTH",
      description: `User ${user.email} changed their password`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    });

    return sendSuccess(res, null, { message: "Password changed successfully" });
  },
);

// ============================================================================
// Reset Password (with employee code)
// ============================================================================

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, employeeCode, newPassword } = req.body;

    if (!email || !employeeCode || !newPassword) {
      return sendError(
        res,
        "Email, employee code, and new password are required",
      );
    }

    // Find user
    const user = await usersRepository.getUserByEmailAndEmployeeCode(
      email,
      employeeCode,
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or employee code",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await usersRepository.updateUser(user.user_id, {
      password: hashedPassword,
      is_active: true,
    });

    // Log password reset
    await logActivity({
      user_id: user.user_id,
      action: "PASSWORD_RESET",
      module: "AUTH",
      description: `Password reset for user ${email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    });

    return sendSuccess(res, null, { message: "Password reset successfully" });
  },
);

// ============================================================================
// Refresh Token
// ============================================================================

export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return sendError(res, "Refresh token required");
    }

    // Verify refresh token
    const secret = (process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET ||
      "") as string;
    let decoded: any;

    try {
      decoded = jwt.verify(refresh_token, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: "Invalid refresh token",
      });
    }

    // Check if token is valid in database
    const storedToken = await authRepository.getRefreshToken(
      refresh_token,
      decoded.user_id,
    );

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        error: "Invalid or revoked refresh token",
      });
    }

    // Get user data
    const user = await usersRepository.getUserById(decoded.user_id);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    // --- IMPLEMENT REFRESH TOKEN ROTATION ---

    // 1. Revoke the old refresh token immediately
    await authRepository.revokeRefreshToken(refresh_token);

    // 2. Issuing a NEW access token (7 days)
    const newAccessToken = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role,
        email: user.email,
        is_admin:
          user.role === "Admin" ||
          user.role === "admin" ||
          user.is_superadmin ||
          false,
        is_superadmin: user.is_superadmin || false,
        jti: uuidv4(),
      },
      (process.env.JWT_SECRET || "") as string,
      { expiresIn: "7d" },
    );

    // 3. Issuing a NEW refresh token (60 days) - Sliding window effect
    const newRefreshToken = jwt.sign(
      { user_id: user.user_id, type: "refresh" },
      secret,
      { expiresIn: "60d" },
    );

    // 4. Store the NEW refresh token
    await authRepository.storeRefreshToken({
      user_id: user.user_id,
      token: newRefreshToken,
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      device_info: req.headers["user-agent"] as string,
    });

    return sendSuccess(res, {
      token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 604800, // 7 days in seconds
    });
  },
);

// ============================================================================
// Email Verification Endpoints
// ============================================================================

export const sendVerificationCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return sendError(res, "Email is required");
    }

    const emailService = await import("../services/email.service.ts");

    const code = emailService.generateVerificationCode();
    emailService.storeVerificationCode(email, code, "signup");
    await emailService.sendVerificationEmail(email, code, "signup");

    return sendSuccess(res, null, {
      message: "Verification code sent to your email",
    });
  },
);

export const verifySignupCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, code } = req.body;

    if (!email || !code) {
      return sendError(res, "Email and code are required");
    }

    const emailService = await import("../services/email.service.ts");
    const verification = await emailService.verifyCode(email, code);

    if (!verification || verification.type !== "signup") {
      return sendError(res, "Invalid or expired verification code");
    }

    emailService.deleteVerificationCode(email);

    return sendSuccess(res, null, { message: "Email verified successfully" });
  },
);
// ============================================================================
// Password Reset Code (Firebase + Custom SMTP)
// ============================================================================

export const sendPasswordResetCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return sendError(res, "Email is required");
    }

    const emailService = await import("../services/email.service.ts");
    const code = emailService.generateVerificationCode();
    
    // Store verification code in database
    await emailService.storeVerificationCode(email, code, "password-reset");
    
    // Send email via our SMTP service
    await emailService.sendVerificationEmail(email, code, "password-reset");

    // Log the reset request
    await logActivity({
      action: "PASSWORD_RESET_REQUESTED",
      module: "AUTH",
      description: `Password reset requested for ${email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    }).catch(() => {});

    return sendSuccess(res, null, {
      message: "If the email exists, a reset code has been sent",
    });
  },
);

export const resetPasswordWithCode = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return sendError(res, "Email, code, and new password are required");
    }

    const emailService = await import("../services/email.service.ts");
    const verification = await emailService.verifyCode(email, code);

    if (!verification || verification.type !== "password-reset") {
      return sendError(res, "Invalid or expired reset code");
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Get user to update
    const user = await usersRepository.getUserByEmail(email);

    if (!user) {
      return sendNotFound(res, "User");
    }

    // Update password
    await usersRepository.updateUser(user.user_id, {
      password: hashedPassword,
    });

    // Delete verification code
    emailService.deleteVerificationCode(email);

    // Log password reset
    await logActivity({
      user_id: user.user_id,
      action: "PASSWORD_RESET_WITH_CODE",
      module: "AUTH",
      description: `Password reset via email verification for ${email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    });

    return sendSuccess(res, null, { message: "Password reset successfully" });
  },
);

// ============================================================================
// Google Login (Mobile Only)
// ============================================================================

export const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return sendError(res, "Google ID Token is required");
  }

  const client = new OAuth2Client();

  try {
    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return sendError(res, "Invalid Google token payload");
    }

  const email = normalizeEmail(payload.email || "");
    const name = (payload.name || email.split("@")[0]) as string;

    if (!email) {
      return sendError(res, "Invalid Google email in token payload");
    }

    // Find or create user
    let userRecord = await usersRepository.getUserByEmail(email);

    if (!userRecord) {
      if (!isSignupEmailAllowed(email)) {
        return sendError(
          res,
          "Signup is restricted to allowlisted company email addresses.",
        );
      }
      // Provision new user
      userRecord = await usersRepository.createUser({
        user_id: uuidv4(),
        email,
        name,
        role: "staff",
        is_active: true,
      });

      await logActivity({
        user_id: userRecord.user_id,
        action: "SIGNUP_GOOGLE",
        module: "AUTH",
        description: `User ${email} provisioned via Google SSO`,
        ip_address: req.ip,
        device_info: req.headers["user-agent"] as string,
      });
    }

    const user = userRecord!; // Guaranteed non-null here

    const is_admin =
      user.role === "Admin" ||
      user.role === "admin" ||
      user.is_superadmin ||
      false;
    const is_superadmin = user.is_superadmin || false;

    // Modern Authentication: Use Firebase Admin SDK for createCustomToken
    const token = await firebaseAdmin.auth().createCustomToken(user.user_id, {
      role: user.role,
      is_admin,
      is_superadmin,
      email: user.email,
    });

    const secret = (process.env.JWT_SECRET || "") as string;

    // Generate refresh token
    const newRefreshToken = jwt.sign(
      { user_id: user.user_id, type: "refresh" },
      (process.env.JWT_REFRESH_SECRET || secret) as string,
      { expiresIn: "60d" },
    );

    // Store refresh token
    await authRepository.storeRefreshToken({
      user_id: user.user_id,
      token: newRefreshToken,
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      device_info: req.headers["user-agent"] as string,
    });

    // Log successful login
    await logActivity({
      user_id: user.user_id,
      action: "LOGIN_GOOGLE_SUCCESS",
      module: "AUTH",
      description: `User ${user.email} logged in via Google SSO`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"] as string,
    });

    return sendSuccess(res, {
      token,
      refresh_token: newRefreshToken,
      expires_in: 604800,
      user: {
        id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_superadmin: user.is_superadmin || false,
        department: user.department,
        designation: user.designation,
        work_location_type: user.work_location_type,
      },
    });
  } catch (error: any) {
    console.error("Google Auth Error:", error);
    return res.status(401).json({
      success: false,
      error:
        "Google authentication failed: " + (error.message || "Invalid token"),
    });
  }
});

// ============================================================================
// Export
// ============================================================================

export default {
  login,
  signup,
  googleLogin,
  getProfile,
  getProfileByEmail,
  logout,
  changePassword,
  resetPassword,
  sendVerificationCode,
  verifySignupCode,
  sendPasswordResetCode,
  resetPasswordWithCode,
  refreshToken,
};
