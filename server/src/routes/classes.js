import { Router } from "express";
import { z } from "zod";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createEnrollmentCode,
  writeAudit,
  parsePositiveId,
} from "../services.js";

const router = Router();
router.use(requireAuth);
const classSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    subject: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional().default(""),
  })
  .strict();
const classSelect = `SELECT c.id, c.teacher_id AS teacherId, c.name, c.subject, c.description,
 c.enrollment_code AS enrollmentCode, c.status, c.created_at AS createdAt, c.updated_at AS updatedAt,
 u.full_name AS teacherName,
 (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id=c.id AND ce.status='active') AS studentCount
 FROM classes c JOIN users u ON u.id=c.teacher_id`;

router.get("/", (req, res) => {
  let rows;

  if (req.user.role === "teacher") {
    rows = db
      .prepare(
        `${classSelect}
   WHERE c.teacher_id=? AND c.status='active'
   ORDER BY c.created_at DESC`,
      )
      .all(req.user.id);
  } else if (req.user.role === "student") {
    rows = db
      .prepare(
        `${classSelect}
         JOIN class_enrollments ce ON ce.class_id=c.id
         WHERE ce.student_id=?
         AND ce.status='active'
         AND c.status='active'
         ORDER BY c.created_at DESC`,
      )
      .all(req.user.id)
      .map((row) => {
        delete row.enrollmentCode;
        return row;
      });
  } else {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "This endpoint is for teachers and students.",
      },
    });
  }

  return res.json({ classes: rows });
});

router.post("/", requireRole("teacher"), (req, res) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the class details.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = db
        .prepare(
          "INSERT INTO classes (teacher_id,name,subject,description,enrollment_code) VALUES (?,?,?,?,?)",
        )
        .run(
          req.user.id,
          parsed.data.name,
          parsed.data.subject,
          parsed.data.description,
          createEnrollmentCode(),
        );
      break;
    } catch (error) {
      if (error.code !== "SQLITE_CONSTRAINT_UNIQUE" || attempt === 2)
        throw error;
    }
  }
  const created = db
    .prepare(`${classSelect} WHERE c.id=?`)
    .get(result.lastInsertRowid);
  writeAudit(db, req.user.id, "class.created", "class", created.id);
  return res.status(201).json({ class: created });
});

router.get("/:id", (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Class ID must be a positive integer.",
      },
    });
  const row = db.prepare(`${classSelect} WHERE c.id=?`).get(id);
  if (!row)
    return res.status(404).json({
      error: { code: "CLASS_NOT_FOUND", message: "Class not found." },
    });
  if (req.user.role === "teacher" && row.teacherId !== req.user.id)
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "You do not own this class." },
    });
  if (req.user.role === "student") {
    const enrolled = db
      .prepare(
        "SELECT 1 FROM class_enrollments WHERE class_id=? AND student_id=? AND status='active'",
      )
      .get(id, req.user.id);
    if (!enrolled || row.status !== "active")
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You are not enrolled in this class.",
        },
      });
    delete row.enrollmentCode;
  } else if (req.user.role !== "teacher") {
    return res
      .status(403)
      .json({ error: { code: "FORBIDDEN", message: "Access denied." } });
  }
  return res.json({ class: row });
});

router.patch("/:id", requireRole("teacher"), (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Class ID must be a positive integer.",
      },
    });
  const parsed = classSchema.partial().strict().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide at least one valid class field.",
        fields: parsed.error?.flatten().fieldErrors,
      },
    });
  const current = db
    .prepare("SELECT id FROM classes WHERE id=? AND teacher_id=?")
    .get(id, req.user.id);
  if (!current)
    return res.status(404).json({
      error: { code: "CLASS_NOT_FOUND", message: "Class not found." },
    });
  const values = parsed.data;
  const sets = [];
  const params = [];
  for (const key of ["name", "subject", "description"])
    if (values[key] !== undefined) {
      sets.push(`${key}=?`);
      params.push(values[key]);
    }
  sets.push("updated_at=datetime('now')");
  params.push(id, req.user.id);
  db.prepare(
    `UPDATE classes SET ${sets.join(", ")} WHERE id=? AND teacher_id=?`,
  ).run(...params);
  writeAudit(db, req.user.id, "class.updated", "class", id, {
    fields: Object.keys(values),
  });
  return res.json({ class: db.prepare(`${classSelect} WHERE c.id=?`).get(id) });
});

router.get("/:id/enrollments", requireRole("teacher"), (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Class ID must be a positive integer.",
      },
    });
  const owned = db
    .prepare("SELECT id FROM classes WHERE id=? AND teacher_id=?")
    .get(id, req.user.id);
  if (!owned)
    return res.status(404).json({
      error: { code: "CLASS_NOT_FOUND", message: "Class not found." },
    });
  const students = db
    .prepare(
      `SELECT u.id, u.full_name AS fullName, u.email, ce.enrolled_at AS enrolledAt
    FROM class_enrollments ce JOIN users u ON u.id=ce.student_id
    WHERE ce.class_id=? AND ce.status='active' ORDER BY u.full_name`,
    )
    .all(id);
  return res.json({ students });
});

export default router;
