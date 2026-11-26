import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../database/db.js";
import { env } from "../config/env.js";
import {
  clearCookieOptions,
  issueSession,
  requireAuth,
  requireRole,
} from "../middleware/auth.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Please try again later.",
    },
  },
});
const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254)
  .transform((email) => email.toLowerCase());
const signupSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: z.string().min(10).max(128),
    role: z.enum(["teacher", "student"]),
    rollNumber: z.string().trim().max(50).optional().default(""),
    teacherCode: z.string().trim().max(50).optional().default(""),
    termsAccepted: z.literal(true),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role === "student" && !data.rollNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rollNumber"],
        message: "Please enter your roll number.",
      });
    }

    if (data.role === "teacher" && !data.teacherCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teacherCode"],
        message: "Please enter the teacher code provided by your admin.",
      });
    }
  });
const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
const resetRequestSchema = z.object({ email: emailSchema }).strict();
const resetSchema = z
  .object({
    token: z.string().min(32).max(256),
    password: z.string().min(10).max(128),
  })
  .strict();
const recoveryResetSchema = z
  .object({
    email: emailSchema,
    recoveryCode: z.string().min(10).max(50),
    password: z.string().min(10).max(128),
  })
  .strict();
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const safeUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  role: user.role,
});

router.post("/signup", authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check your signup details.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const { fullName, email, password, role, rollNumber, teacherCode } =
    parsed.data;

  // Check if this email is already registered.
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({
      error: {
        code: "EMAIL_EXISTS",
        message: "An account with this email already exists.",
      },
    });
  }

  // Teachers must use a valid, unused code issued for their email.
  let matchedTeacherCode = null;

  if (role === "teacher") {
    matchedTeacherCode = db
      .prepare(
        `
        SELECT id
        FROM teacher_signup_codes
        WHERE teacher_code_hash = ?
          AND teacher_email = ?
          AND used_at IS NULL
          AND (expires_at IS NULL OR expires_at > datetime('now'))
      `,
      )
      .get(hashToken(teacherCode), email);

    if (!matchedTeacherCode) {
      return res.status(403).json({
        error: {
          code: "INVALID_TEACHER_CODE",
          message:
            "The teacher code is invalid, expired, already used, or assigned to another email.",
        },
      });
    }
  }

  const recoveryCode =
    `SGAI-${randomBytes(2).toString("hex").toUpperCase()}-` +
    `${randomBytes(2).toString("hex").toUpperCase()}-` +
    `${randomBytes(2).toString("hex").toUpperCase()}`;

  const recoveryCodeHash = hashToken(recoveryCode);

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    // Keep account creation and teacher-code consumption together.
    const createAccount = db.transaction(() => {
      if (role === "teacher") {
        const codeUse = db
          .prepare(
            `
            UPDATE teacher_signup_codes
            SET used_at = datetime('now')
            WHERE id = ?
              AND used_at IS NULL
              AND (expires_at IS NULL OR expires_at > datetime('now'))
          `,
          )
          .run(matchedTeacherCode.id);

        if (codeUse.changes !== 1) {
          throw new Error("TEACHER_CODE_ALREADY_USED");
        }
      }

      const result = db
        .prepare(
          `
          INSERT INTO users (
            full_name,
            email,
            password_hash,
            role,
            roll_number
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run(
          fullName,
          email,
          passwordHash,
          role,
          role === "student" ? rollNumber : null,
        );

      db.prepare(
        `
        INSERT INTO user_recovery_codes
          (user_id, recovery_code_hash)
        VALUES (?, ?)
      `,
      ).run(result.lastInsertRowid, recoveryCodeHash);

      const user = db
        .prepare(
          `
          SELECT id, full_name, email, role, token_version
          FROM users
          WHERE id = ?
        `,
        )
        .get(result.lastInsertRowid);

      db.prepare(
        `
        INSERT INTO audit_logs
          (actor_user_id, action, entity_type, entity_id)
        VALUES (?, ?, ?, ?)
      `,
      ).run(user.id, "auth.signup", "user", String(user.id));

      return user;
    });

    const user = createAccount();

    issueSession(res, user);

    return res.status(201).json({
      message: "Your account has been created.",
      user: safeUser(user),
      recoveryCode,
    });
  } catch (error) {
    console.error("Signup failed:", error?.code || error?.message || "UNKNOWN");

    if (error?.message === "TEACHER_CODE_ALREADY_USED") {
      return res.status(403).json({
        error: {
          code: "INVALID_TEACHER_CODE",
          message: "This teacher code has already been used or expired.",
        },
      });
    }

    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: {
          code: "SIGNUP_CONFLICT",
          message: "This email or roll number is already registered.",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "SIGNUP_FAILED",
        message: "We could not create your account. Please try again.",
      },
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid email and password.",
      },
    });
  const user = db
    .prepare(
      "SELECT id,full_name,email,password_hash,role,status,token_version FROM users WHERE email = ?",
    )
    .get(parsed.data.email);
  const passwordOk = user
    ? await bcrypt.compare(parsed.data.password, user.password_hash)
    : false;
  if (!user || !passwordOk || user.status !== "active")
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      },
    });
  issueSession(res, user);
  db.prepare(
    "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES (?,?,?,?)",
  ).run(user.id, "auth.login", "user", String(user.id));
  return res.json({ message: "You are now logged in.", user: safeUser(user) });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
router.post("/logout", (req, res) => {
  const token = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (token) {
    try {
      const jwtPayload = jwt.verify(token, env.JWT_SECRET, {
        issuer: "smartgrade-ai",
        audience: "smartgrade-ai-web",
      });
      if (jwtPayload.sub)
        db.prepare(
          "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
        ).run(Number(jwtPayload.sub));
    } catch {
      /* clearing the cookie still ends this browser session */
    }
  }
  res.clearCookie(env.AUTH_COOKIE_NAME, clearCookieOptions());
  return res.json({ message: "You have been logged out." });
});

router.post("/forgot-password", authLimiter, (req, res) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid email address.",
      },
    });
  const user = db
    .prepare("SELECT id,email FROM users WHERE email = ? AND status = 'active'")
    .get(parsed.data.email);
  const response = {
    message:
      "If an active account exists for that email, password reset instructions will be provided.",
  };
  if (!user) return res.json(response);
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000,
  ).toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    ).run(user.id);
    db.prepare(
      "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,?)",
    ).run(user.id, hashToken(rawToken), expiresAt);
  });
  tx();
  // No email provider is configured yet. Only local development exposes the one-time token for testing.
  if (env.NODE_ENV !== "production")
    return res.json({
      ...response,
      developmentResetToken: rawToken,
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    });
  return res.json(response);
});

router.post("/reset-password", authLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Provide a valid reset token and a password of at least 10 characters.",
      },
    });
  const tokenHash = hashToken(parsed.data.token);
  const row = db
    .prepare(
      "SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash = ?",
    )
    .get(tokenHash);
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now())
    return res.status(400).json({
      error: {
        code: "RESET_TOKEN_INVALID",
        message: "This reset token is invalid or expired. Request a new one.",
      },
    });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const tx = db.transaction(() => {
    const fresh = db
      .prepare(
        "SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE id = ?",
      )
      .get(row.id);
    if (!fresh || fresh.used_at || Date.parse(fresh.expires_at) <= Date.now())
      throw new Error("RESET_TOKEN_INVALID");
    db.prepare(
      "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
    ).run(passwordHash, row.user_id);
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?",
    ).run(row.id);
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    ).run(row.user_id);
    db.prepare(
      "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES (?,?,?,?)",
    ).run(row.user_id, "auth.password_reset", "user", String(row.user_id));
  });
  try {
    tx();
  } catch {
    return res.status(400).json({
      error: {
        code: "RESET_TOKEN_INVALID",
        message: "This reset token is invalid or expired. Request a new one.",
      },
    });
  }
  res.clearCookie(env.AUTH_COOKIE_NAME, clearCookieOptions());
  return res.json({
    message: "Password updated. Please log in with your new password.",
  });
});

router.post("/reset-password-with-recovery", authLimiter, async (req, res) => {
  const parsed = recoveryResetSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide a valid email, recovery code, and password.",
      },
    });
  }

  const { email, recoveryCode, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const recoveryCodeHash = hashToken(recoveryCode.trim().toUpperCase());

  const user = db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .get(normalizedEmail);

  if (!user) {
    return res.status(400).json({
      error: {
        code: "RECOVERY_INVALID",
        message: "Email or recovery code is incorrect.",
      },
    });
  }

  const recovery = db
    .prepare(
      "SELECT user_id, recovery_code_hash FROM user_recovery_codes WHERE user_id = ?",
    )
    .get(user.id);

  if (!recovery || recovery.recovery_code_hash !== recoveryCodeHash) {
    return res.status(400).json({
      error: {
        code: "RECOVERY_INVALID",
        message: "Email or recovery code is incorrect.",
      },
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const tx = db.transaction(() => {
      const currentRecovery = db
        .prepare(
          "SELECT recovery_code_hash FROM user_recovery_codes WHERE user_id = ?",
        )
        .get(user.id);

      if (
        !currentRecovery ||
        currentRecovery.recovery_code_hash !== recoveryCodeHash
      ) {
        throw new Error("RECOVERY_INVALID");
      }

      db.prepare(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(passwordHash, user.id);

      db.prepare(
        "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
      ).run(user.id);

      db.prepare(
        "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)",
      ).run(user.id, "auth.password_recovery", "user", String(user.id));
    });

    tx();
  } catch {
    return res.status(400).json({
      error: {
        code: "RECOVERY_INVALID",
        message: "Recovery code is invalid or has already been used.",
      },
    });
  }

  res.clearCookie(env.AUTH_COOKIE_NAME, clearCookieOptions());

  return res.json({
    message: "Password updated. Please log in with your new password.",
  });
});

router.post(
  "/admin/teacher-codes",
  requireAuth,
  requireRole("admin"),
  (req, res) => {
    const schema = z
      .object({
        email: emailSchema,
        expiresInDays: z.number().int().min(1).max(90).optional().default(30),
      })
      .strict();

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Enter a valid teacher email.",
        },
      });
    }

    const teacherEmail = parsed.data.email.trim().toLowerCase();

    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(teacherEmail);

    if (existingUser) {
      return res.status(409).json({
        error: {
          code: "EMAIL_EXISTS",
          message: "An account with this email already exists.",
        },
      });
    }

    const rawCode = `TCH-${randomBytes(4).toString("hex").toUpperCase()}`;
    const codeHash = hashToken(rawCode);

    const expiresAt = new Date(
      Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      db.prepare(
        `
        INSERT INTO teacher_signup_codes (
          teacher_code_hash,
          teacher_email,
          created_by,
          expires_at
        )
        VALUES (?, ?, ?, ?)
      `,
      ).run(codeHash, teacherEmail, req.user.id, expiresAt);

      db.prepare(
        `
        INSERT INTO audit_logs (
          actor_user_id,
          action,
          entity_type,
          entity_id
        )
        VALUES (?, ?, ?, ?)
      `,
      ).run(
        req.user.id,
        "admin.teacher_signup_code_created",
        "teacher_signup_code",
        teacherEmail,
      );

      return res.status(201).json({
        message: "Teacher signup code created.",
        email: teacherEmail,
        teacherCode: rawCode,
        expiresAt,
      });
    } catch (error) {
      console.error("Teacher code creation failed:", error?.code || "UNKNOWN");

      return res.status(500).json({
        error: {
          code: "TEACHER_CODE_CREATE_FAILED",
          message: "Could not create the teacher signup code.",
        },
      });
    }
  },
);

export default router;
