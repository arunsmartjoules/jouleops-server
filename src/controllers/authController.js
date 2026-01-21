import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import usersService from "../services/usersService.js";
import supabase from "../config/supabase.js";
import { logActivity } from "../services/logsService.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/**
 * Auth Controller
 */

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Find user by email
    // We use supabase directly here because usersService doesn't include password field in its selects usually
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // Check password
    // If password is not set in DB (e.g. migration state), fail or handle accordingly
    // For this task, we assume bcrypt is used.
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: "Authentication not configured for this user",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not defined");
    }

    const token = jwt.sign(
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
      },
      secret,
      { expiresIn: "30d" }, // Increased for dev
    );

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { user_id: user.user_id, type: "refresh" },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    // Hash refresh token before storing
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // Store refresh token hash in database
    await supabase.from("refresh_tokens").insert({
      user_id: user.user_id,
      token_hash: tokenHash, // Store hash, not raw token
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      device_info: req.headers["user-agent"],
    });

    // Remove sensitive data
    delete user.password;

    // Log successful login
    await logActivity({
      user_id: user.user_id,
      action: "LOGIN_SUCCESS",
      module: "AUTH",
      description: `User ${user.email} logged in`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    res.json({
      success: true,
      data: {
        token,
        refresh_token: refreshToken,
        expires_in: 900,
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
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    // req.user is set by verifyToken middleware
    const user = await usersService.getUserById(req.user.user_id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const signup = async (req, res) => {
  // console.log("Signup endpoint called"); // Removed sensitive log
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: "Email, password, and name are required",
      });
    }

    // Check if user already exists
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw new Error(`Error checking user: ${fetchError.message}`);
    }

    if (user && user.password) {
      return res.status(400).json({
        success: false,
        error: "Account already registered. Please sign in.",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let updatedUser;

    if (user) {
      // Scenario A: User exists but has no password (Claiming)
      const { data, error: updateError } = await supabase
        .from("users")
        .update({
          password: hashedPassword,
          name: name || user.name,
          is_active: true,
        })
        .eq("user_id", user.user_id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to claim account: ${updateError.message}`);
      }
      updatedUser = data;
    } else {
      // Scenario B: Entirely new user (Registering)
      const { data, error: insertError } = await supabase
        .from("users")
        .insert({
          user_id: uuidv4(),
          email,
          password: hashedPassword,
          name,
          role: "staff", // Default role
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to register user: ${insertError.message}`);
      }
      updatedUser = data;
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not defined");
    }

    const token = jwt.sign(
      {
        user_id: updatedUser.user_id,
        role: updatedUser.role,
        email: updatedUser.email,
        is_admin:
          updatedUser.role === "Admin" ||
          updatedUser.role === "admin" ||
          updatedUser.is_superadmin ||
          false,
        is_superadmin: updatedUser.is_superadmin || false,
      },
      secret,
      { expiresIn: "30d" },
    );

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { user_id: updatedUser.user_id, type: "refresh" },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    // Hash refresh token before storing
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // Store refresh token hash in database
    await supabase.from("refresh_tokens").insert({
      user_id: updatedUser.user_id,
      token_hash: tokenHash, // Store hash
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      device_info: req.headers["user-agent"],
    });

    // Remove sensitive data
    delete updatedUser.password;

    // Log successful signup
    await logActivity({
      user_id: updatedUser.user_id,
      action: updatedUser.password ? "SIGNUP_REGISTER" : "SIGNUP_CLAIM",
      module: "AUTH",
      description: `User ${updatedUser.email} ${
        updatedUser.password ? "registered" : "claimed account"
      }`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        refresh_token: refreshToken,
        expires_in: 900,
        user: {
          id: updatedUser.user_id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          is_superadmin: updatedUser.is_superadmin || false,
        },
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, employeeCode, newPassword } = req.body;

    if (!email || !employeeCode || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Email, employee code, and new password are required",
      });
    }

    // Find user by email and employee_code
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("employee_code", employeeCode)
      .single();

    if (fetchError || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or employee code",
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    const { error: updateError } = await supabase
      .from("users")
      .update({
        password: hashedPassword,
        is_active: true,
      })
      .eq("user_id", user.user_id);

    if (updateError) {
      throw new Error(`Failed to reset password: ${updateError.message}`);
    }

    // Log successful password reset
    await logActivity({
      user_id: user.user_id,
      action: "PASSWORD_RESET",
      module: "AUTH",
      description: `Password reset for user ${email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// New verification endpoints
export const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Dynamic import for email service
    const emailService = await import("../services/email.service.ts");

    const code = emailService.generateVerificationCode();
    emailService.storeVerificationCode(email, code, "signup");
    await emailService.sendVerificationEmail(email, code, "signup");

    res.json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    console.error("Send verification code error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifySignupCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: "Email and code are required",
      });
    }

    const emailService = await import("../services/email.service.ts");
    const verification = emailService.verifyCode(email, code);

    if (!verification || verification.type !== "signup") {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification code",
      });
    }

    // Delete the code after successful verification
    emailService.deleteVerificationCode(email);

    res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const sendPasswordResetCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required",
      });
    }

    // Check if user exists
    const { data: user } = await supabase
      .from("users")
      .select("user_id, email")
      .eq("email", email)
      .single();

    if (!user) {
      // For security, don't reveal if email exists
      return res.json({
        success: true,
        message: "If the email exists, a reset code has been sent",
      });
    }

    const emailService = await import("../services/email.service.ts");
    const code = emailService.generateVerificationCode();
    emailService.storeVerificationCode(
      email,
      code,
      "password-reset",
      user.user_id,
    );
    await emailService.sendVerificationEmail(email, code, "password-reset");

    res.json({
      success: true,
      message: "If the email exists, a reset code has been sent",
    });
  } catch (error) {
    console.error("Send password reset code error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resetPasswordWithCode = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Email, code, and new password are required",
      });
    }

    const emailService = await import("../services/email.service.ts");
    const verification = emailService.verifyCode(email, code);

    if (!verification || verification.type !== "password-reset") {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired reset code",
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("email", email);

    if (updateError) {
      throw new Error(`Failed to reset password: ${updateError.message}`);
    }

    // Delete the verification code
    emailService.deleteVerificationCode(email);

    // Log password reset
    await logActivity({
      user_id: verification.userId,
      action: "PASSWORD_RESET_WITH_CODE",
      module: "AUTH",
      description: `Password reset via email verification for ${email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password with code error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "LOGOUT_SUCCESS",
        module: "AUTH",
        description: `User ${req.user.email} logged out`,
        ip_address: req.ip,
        device_info: req.headers["user-agent"],
      });
    }

    const { refresh_token } = req.body;
    if (refresh_token) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(refresh_token)
        .digest("hex");

      // Revoke the specific token
      await supabase
        .from("refresh_tokens")
        .delete()
        .eq("token_hash", tokenHash);
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    }

    // Get user with password
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Verify current password
    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: "Password not set for this account",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("user_id", userId);

    if (updateError) {
      throw new Error(`Failed to update password: ${updateError.message}`);
    }

    // Log password change
    await logActivity({
      user_id: userId,
      action: "PASSWORD_CHANGE",
      module: "AUTH",
      description: `User ${user.email} changed their password`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: "Refresh token required",
      });
    }

    // Verify refresh token
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, secret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: "Invalid refresh token",
      });
    }

    // Hash the incoming token to find it
    const tokenHash = crypto
      .createHash("sha256")
      .update(refresh_token)
      .digest("hex");

    // Check if token hash is in database (not revoked)
    const { data: storedToken } = await supabase
      .from("refresh_tokens")
      .select("*")
      .eq("token_hash", tokenHash) // Check against hash
      .eq("user_id", decoded.user_id)
      .eq("revoked", false)
      .single();

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        error: "Invalid or revoked refresh token",
      });
    }

    // Get user data
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", decoded.user_id)
      .single();

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    // Generate new access token
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
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({
      success: true,
      data: {
        token: newAccessToken,
        expires_in: 2592000, // 30 days in seconds
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Refresh token expired",
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  login,
  signup,
  getProfile,
  logout,
  changePassword,
  resetPassword,
  sendVerificationCode,
  verifySignupCode,
  sendPasswordResetCode,
  sendPasswordResetCode,
  resetPasswordWithCode,
  refreshToken,
};
