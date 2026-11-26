import { Router } from "express";
import { z } from "zod";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../services.js";

const router = Router();
router.use(requireAuth);
const joinSchema = z
  .object({
    enrollmentCode: z
      .string()
      .trim()
      .min(6)
      .max(20)
      .transform((v) => v.toUpperCase()),
  })
  .strict();

router.post("/join", requireRole("student"), (req, res) => {
  const parsed = joinSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid class enrollment code.",
      },
    });
  const klass = db
    .prepare(
      "SELECT id,name,subject,teacher_id FROM classes WHERE enrollment_code=? AND status='active'",
    )
    .get(parsed.data.enrollmentCode);
  if (!klass)
    return res.status(404).json({
      error: {
        code: "CLASS_NOT_FOUND",
        message: "No active class matches that enrollment code.",
      },
    });
  const existing = db
    .prepare(
      "SELECT id,status FROM class_enrollments WHERE class_id=? AND student_id=?",
    )
    .get(klass.id, req.user.id);
  if (existing?.status === "active")
    return res.status(409).json({
      error: {
        code: "ALREADY_ENROLLED",
        message: "You are already enrolled in this class.",
      },
    });
  if (existing) {
    db.prepare(
      "UPDATE class_enrollments SET status='active', enrolled_at=datetime('now') WHERE id=?",
    ).run(existing.id);
  } else {
    db.prepare(
      "INSERT INTO class_enrollments (class_id,student_id) VALUES (?,?)",
    ).run(klass.id, req.user.id);
  }
  writeAudit(db, req.user.id, "class.enrolled", "class", klass.id);
  return res.status(201).json({
    message: "You joined the class successfully.",
    class: { id: klass.id, name: klass.name, subject: klass.subject },
  });
});

router.delete("/:id", requireRole("teacher"), (req, res) => {
  const enrollmentId = Number(req.params.id);
  if (!Number.isSafeInteger(enrollmentId) || enrollmentId < 1)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Enrollment ID must be a positive integer.",
      },
    });
  const enrollment = db
    .prepare(
      `SELECT ce.id,ce.class_id AS classId FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id
    WHERE ce.id=? AND c.teacher_id=? AND ce.status='active'`,
    )
    .get(enrollmentId, req.user.id);
  if (!enrollment)
    return res.status(404).json({
      error: {
        code: "ENROLLMENT_NOT_FOUND",
        message: "Active enrollment not found.",
      },
    });
  db.prepare("UPDATE class_enrollments SET status='removed' WHERE id=?").run(
    enrollmentId,
  );
  writeAudit(
    db,
    req.user.id,
    "class.enrollment_removed",
    "enrollment",
    enrollmentId,
  );
  return res.json({ message: "Student removed from the class." });
});

export default router;
