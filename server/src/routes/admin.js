import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/overview", (_req, res) => {
  const users = db
    .prepare(
      "SELECT COUNT(*) AS total, SUM(role='teacher') AS teachers, SUM(role='student') AS students, SUM(role='admin') AS admins, SUM(status='active') AS active, SUM(status='disabled') AS disabled FROM users",
    )
    .get();
  const classes = db
    .prepare(
      "SELECT COUNT(*) AS total, SUM(status='active') AS active FROM classes",
    )
    .get();
  const assignments = db
    .prepare(
      "SELECT COUNT(*) AS total, SUM(status='published') AS published FROM assignments",
    )
    .get();
  const submissions = db
    .prepare("SELECT COUNT(*) AS total FROM submissions")
    .get();
  const email = db
    .prepare(
      "SELECT COUNT(*) AS total, SUM(status='sent') AS sent, SUM(status='failed') AS failed, SUM(status='skipped') AS skipped FROM email_delivery_logs WHERE created_at >= datetime('now','-30 days')",
    )
    .get();
  const recentAudit = db
    .prepare(
      `SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.full_name AS actor_name,u.email AS actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 10`,
    )
    .all();
  res.json({
    overview: { users, classes, assignments, submissions, email },
    recentAudit,
  });
});

router.get("/users", (req, res) => {
  const parsed = z
    .object({
      q: z.string().trim().max(120).optional(),
      role: z.enum(["all", "teacher", "student", "admin"]).optional(),
      status: z.enum(["all", "active", "disabled"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid user filters." },
    });
  const { q = "", role = "all", status = "all", limit, offset } = parsed.data;
  const where = [];
  const params = [];
  if (q) {
    where.push("(full_name LIKE ? OR email LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (role !== "all") {
    where.push("role = ?");
    params.push(role);
  }
  if (status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM users ${clause}`)
    .get(...params).count;
  const users = db
    .prepare(
      `SELECT id,full_name AS fullName,email,role,status,created_at AS createdAt,updated_at AS updatedAt,
       (SELECT COUNT(*) FROM classes c WHERE c.teacher_id=users.id) AS ownedClassCount,
       (SELECT COUNT(*) FROM assignments a WHERE a.teacher_id=users.id) AS ownedAssignmentCount,
       (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.teacher_id=users.id) AS teachingSubmissionCount,
       (SELECT COUNT(*) FROM submissions s WHERE s.student_id=users.id) AS submittedWorkCount,
       (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.student_id=users.id) AS enrollmentCount
       FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);
  res.json({ users, total, limit, offset });
});

const statusSchema = z
  .object({ status: z.enum(["active", "disabled"]) })
  .strict();
router.patch("/users/:id/status", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res
      .status(400)
      .json({ error: { code: "INVALID_ID", message: "Invalid user ID." } });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose active or disabled status.",
      },
    });
  if (id === req.user.id)
    return res.status(400).json({
      error: {
        code: "SELF_DISABLE",
        message: "You cannot change your own account status.",
      },
    });
  const target = db
    .prepare("SELECT id,role,status FROM users WHERE id=?")
    .get(id);
  if (!target)
    return res
      .status(404)
      .json({ error: { code: "USER_NOT_FOUND", message: "User not found." } });
  if (target.role === "admin")
    return res.status(403).json({
      error: {
        code: "ADMIN_PROTECTED",
        message: "Administrator accounts cannot be disabled from this screen.",
      },
    });
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE users SET status=?, token_version=token_version+1, updated_at=datetime('now') WHERE id=?",
    ).run(parsed.data.status, id);
    db.prepare(
      "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)",
    ).run(
      req.user.id,
      `admin.user.${parsed.data.status}`,
      "user",
      String(id),
      JSON.stringify({
        previousStatus: target.status,
        newStatus: parsed.data.status,
      }),
    );
  });
  tx();
  res.json({
    message: `User account ${parsed.data.status}.`,
    user: { id, status: parsed.data.status },
  });
});

router.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "Invalid user ID." },
    });
  if (id === req.user.id)
    return res.status(400).json({
      error: { code: "SELF_DELETE", message: "You cannot delete your own administrator account." },
    });

  const target = db
    .prepare("SELECT id,role FROM users WHERE id=?")
    .get(id);
  if (!target)
    return res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "User not found." },
    });
  if (target.role === "admin")
    return res.status(403).json({
      error: { code: "ADMIN_PROTECTED", message: "Administrator accounts cannot be deleted from this screen." },
    });

  const fileNames = [
    ...db.prepare(`SELECT DISTINCT s.stored_file_name AS name FROM submissions s
      LEFT JOIN assignments a ON a.id=s.assignment_id
      LEFT JOIN classes c ON c.id=a.class_id
      WHERE s.stored_file_name IS NOT NULL AND
        (s.student_id=? OR a.teacher_id=? OR c.teacher_id=?)`).all(id, id, id),
    ...db.prepare("SELECT stored_name AS name FROM question_papers WHERE teacher_id=?").all(id),
    ...db.prepare(`SELECT DISTINCT a.attachment_stored_name AS name FROM assignments a
      LEFT JOIN classes c ON c.id=a.class_id
      WHERE a.attachment_stored_name IS NOT NULL AND (a.teacher_id=? OR c.teacher_id=?)`).all(id, id),
  ].map((row) => row.name).filter(Boolean);
  const deletionImpact = target.role === "teacher"
    ? db.prepare(`SELECT
        (SELECT COUNT(*) FROM classes WHERE teacher_id=?) AS classes,
        (SELECT COUNT(*) FROM assignments WHERE teacher_id=?) AS assignments,
        (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id LEFT JOIN classes c ON c.id=a.class_id WHERE a.teacher_id=? OR c.teacher_id=?) AS submissions`).get(id, id, id, id)
    : db.prepare(`SELECT
        (SELECT COUNT(*) FROM class_enrollments WHERE student_id=?) AS enrollments,
        (SELECT COUNT(*) FROM submissions WHERE student_id=?) AS submissions,
        (SELECT COUNT(*) FROM submissions WHERE student_id=? AND grading_status='released') AS releasedResults`).get(id, id, id);
  const uploadsRoot = path.resolve(env.uploadDirectory);
  const filesToCheck = [...new Set(fileNames)].map((name) => {
    const filePath = path.resolve(uploadsRoot, name);
    if (path.dirname(filePath) !== uploadsRoot || path.basename(name) !== name)
      throw new Error("Unsafe stored upload path.");
    return { name, filePath };
  });

  try {
    const removeAccount = db.transaction(() => {
      db.prepare(
        "INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)",
      ).run(
        req.user.id,
        "admin.user.deleted",
        "user",
        String(id),
        JSON.stringify({ role: target.role, deletedRelatedRecords: deletionImpact }),
      );
      if (target.role === "teacher") {
        db.prepare("DELETE FROM classes WHERE teacher_id=?").run(id);
        db.prepare("DELETE FROM assignments WHERE teacher_id=?").run(id);
      }
      const result = db.prepare("DELETE FROM users WHERE id=?").run(id);
      if (result.changes !== 1) throw new Error("User changed during deletion.");
    });
    removeAccount();
  } catch (error) {
    console.error("Admin account deletion failed:", error?.message || "Unknown error");
    return res.status(409).json({
      error: {
        code: "USER_DELETE_BLOCKED",
        message: "The account could not be deleted because related records still depend on it.",
      },
    });
  }

  let fileCleanupFailures = 0;
  for (const file of filesToCheck) {
    const references = db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT stored_file_name AS name FROM submissions WHERE stored_file_name=?
        UNION ALL SELECT stored_name AS name FROM question_papers WHERE stored_name=?
        UNION ALL SELECT attachment_stored_name AS name FROM assignments WHERE attachment_stored_name=?
      )
    `).get(file.name, file.name, file.name).count;
    if (references === 0 && fs.existsSync(file.filePath)) {
      try {
        fs.unlinkSync(file.filePath);
      } catch (error) {
        fileCleanupFailures += 1;
        console.warn("Could not remove an unreferenced user upload:", error?.message || "Unknown error");
      }
    }
  }

  return res.json({
    message: fileCleanupFailures
      ? "User account deleted, but one or more stored files could not be removed automatically."
      : "User account permanently deleted. Its email can be registered again.",
    deletedUserId: id,
    fileCleanupFailures,
  });
});

router.get("/audit-logs", (req, res) => {
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 50),
  );
  const logs = db
    .prepare(
      `SELECT a.id,a.action,a.entity_type AS entityType,a.entity_id AS entityId,a.metadata_json AS metadataJson,a.created_at AS createdAt,u.full_name AS actorName,u.email AS actorEmail FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit);
  res.json({ logs });
});

router.get("/email-deliveries", (req, res) => {
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 50),
  );
  const logs = db
    .prepare(
      "SELECT id,event_key AS eventKey,recipient_email AS recipientEmail,subject,status,error_message AS errorMessage,created_at AS createdAt FROM email_delivery_logs ORDER BY id DESC LIMIT ?",
    )
    .all(limit);
  res.json({ logs });
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(14).max(128),
  })
  .strict();

router.patch("/users/:id/password", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Invalid user ID.",
      },
    });
  }

  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Password must contain between 14 and 128 characters.",
      },
    });
  }

  if (id === req.user.id) {
    return res.status(400).json({
      error: {
        code: "SELF_RESET",
        message: "Use your own account's password-change process.",
      },
    });
  }

  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);

  if (!target) {
    return res.status(404).json({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found.",
      },
    });
  }

  if (target.role === "admin") {
    return res.status(403).json({
      error: {
        code: "ADMIN_PROTECTED",
        message: "Admin passwords cannot be reset from this screen.",
      },
    });
  }

  const passwordHash = bcrypt.hashSync(parsed.data.password, 12);

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
    ).run(passwordHash, id);

    db.prepare(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL",
    ).run(id);

    db.prepare(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?)",
    ).run(
      req.user.id,
      "admin.user.password_reset",
      "user",
      String(id),
      JSON.stringify({ method: "admin_dashboard" }),
    );
  });

  tx();

  return res.json({
    message: "User password reset successfully. The user must log in again.",
  });
});

export default router;
