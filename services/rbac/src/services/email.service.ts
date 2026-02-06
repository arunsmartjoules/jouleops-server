import { Resend } from "resend";
import { logActivity } from "../repositories/logsRepository";

const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory store for verification codes (in production, use Redis or database)
interface VerificationCode {
  code: string;
  email: string;
  type: "signup" | "password-reset" | "superadmin-change";
  expiresAt: Date;
  userId?: string;
}

import { query, queryOne } from "@smartops/shared";

// Generate 6-digit code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store verification code
export async function storeVerificationCode(
  email: string,
  code: string,
  type: "signup" | "password-reset" | "superadmin-change",
  userId?: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Upsert or insert (delete previous codes for this email/type first to be clean)
  await query("DELETE FROM verification_codes WHERE email = $1 AND type = $2", [
    email,
    type,
  ]);

  await query(
    "INSERT INTO verification_codes (email, code, type, user_id, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [email, code, type, userId || null, expiresAt],
  );
}

// Verify code
export async function verifyCode(
  email: string,
  code: string,
): Promise<{ email: string; type: string; userId?: string } | null> {
  const data = await queryOne<{
    email: string;
    type: string;
    user_id?: string;
  }>(
    `SELECT * FROM verification_codes 
     WHERE email = $1 AND code = $2 AND expires_at > NOW()`,
    [email, code],
  );

  if (!data) {
    return null;
  }

  return {
    email: data.email,
    type: data.type,
    userId: data.user_id,
  };
}

// Delete verification code
export async function deleteVerificationCode(email: string): Promise<void> {
  await query("DELETE FROM verification_codes WHERE email = $1", [email]);
}

// Send verification email
export async function sendVerificationEmail(
  email: string,
  code: string,
  type: "signup" | "password-reset" | "superadmin-change",
): Promise<void> {
  const subjects = {
    signup: "Verify Your SmartOps Account",
    "password-reset": "Reset Your SmartOps Password",
    "superadmin-change": "Confirm Superadmin Change",
  };

  const messages = {
    signup: `Your verification code is: <strong>${code}</strong><br>This code will expire in 15 minutes.`,
    "password-reset": `Your password reset code is: <strong>${code}</strong><br>This code will expire in 15 minutes.<br>If you didn't request this, please ignore this email.`,
    "superadmin-change": `A request to change the superadmin has been made.<br>Your verification code is: <strong>${code}</strong><br>This code will expire in 15 minutes.<br>If you didn't request this, please contact your administrator immediately.`,
  };

  // Log OTP to console for development/debugging - REMOVED FOR SECURITY
  // console.log(`\n========================================`);
  // console.log(`📧 OTP for ${email}: ${code}`);
  // console.log(`   Type: ${type}`);
  // console.log(`========================================\n`);

  try {
    const result = await resend.emails.send({
      from: "SmartOps Admin <onboarding@resend.dev>", // You'll update this with your domain
      to: email,
      subject: subjects[type],
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
              .code { background: white; border: 2px solid #dc2626; color: #dc2626; font-size: 32px; font-weight: bold; padding: 20px; text-align: center; letter-spacing: 8px; margin: 20px 0; border-radius: 8px; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>SmartOps Admin</h1>
              </div>
              <div class="content">
                <p>${messages[type]}</p>
                <div class="code">${code}</div>
                <p style="color: #666; font-size: 14px;">This verification code will expire in 15 minutes.</p>
              </div>
              <div class="footer">
                <p>© 2026 SmartJoules. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });
    console.log("Email sent successfully:", result);

    // Log successful email send
    await logActivity({
      action: "EMAIL_SENT",
      module: "EMAIL",
      description: `${type} email sent to ${email}`,
    }).catch(() => {}); // Ignore log errors
  } catch (error: any) {
    console.error("❌ Error sending email:", error);
    console.error("   Error details:", JSON.stringify(error, null, 2));

    // Log email error to app logs
    await logActivity({
      action: "EMAIL_ERROR",
      module: "EMAIL",
      description: `Failed to send ${type} email to ${email}: ${
        error.message || "Unknown error"
      }`,
    }).catch(() => {}); // Ignore log errors

    // Don't throw error - OTP is logged to console for development
    console.log(`⚠️  Email failed but OTP is logged above. Use code: ${code}`);
  }
}
