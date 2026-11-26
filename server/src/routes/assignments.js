import { Router } from "express";
import { z } from "zod";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAudit, parsePositiveId } from "../services.js";
import { notifyMany } from "../notifications.js";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";

const router = Router();
const assignmentFilesDirectory = path.join(
  env.uploadDirectory,
  "assignment-files",
);

fs.mkdirSync(assignmentFilesDirectory, { recursive: true });

const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);

const assignmentAttachmentStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, assignmentFilesDirectory);
  },

  filename: (_req, _file, callback) => {
    callback(
      null,
      `${randomUUID()}${path.extname(_file.originalname).toLowerCase()}`,
    );
  },
});

const assignmentAttachmentUpload = multer({
  storage: assignmentAttachmentStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Only PDF, DOC, and DOCX files are allowed."));
    }

    callback(null, true);
  },
});
router.use(requireAuth);
const assignmentSchema = z
  .object({
    classId: z.number().int().positive(),
    title: z.string().trim().min(2).max(160),
    instructions: z.string().trim().max(10000).optional().default(""),
    questions: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(10000),
            marks: z.number().finite().positive().max(10000),
          })
          .strict(),
      )
      .max(200)
      .optional()
      .default([]),
    totalMarks: z.number().positive().max(10000),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();
const assignmentUpdateSchema = assignmentSchema
  .omit({ classId: true })
  .partial()
  .strict();
const assignmentSelect = `SELECT
  a.id,
  a.class_id AS classId,
  a.teacher_id AS teacherId,
  a.title,
  a.instructions,
  a.attachment_original_name AS attachmentOriginalName,
  a.attachment_file_size AS attachmentFileSize,
  a.total_marks AS totalMarks,
  a.questions_json AS questionsJson,
  a.due_at AS dueAt,
  a.status,
  a.published_at AS publishedAt,
  a.created_at AS createdAt,
  a.updated_at AS updatedAt,
  c.name AS className,
  c.subject AS classSubject,
  c.status AS classStatus
  FROM assignments a JOIN classes c ON c.id=a.class_id`;

function withQuestions(row) {
  if (!row) return row;
  const copy = {
    ...row,
    questions: (() => {
      try {
        return JSON.parse(row.questionsJson || "[]");
      } catch {
        return [];
      }
    })(),
  };
  delete copy.questionsJson;
  return copy;
}
function canViewAssignment(assignment, user) {
  if (user.role === "teacher") return assignment.teacherId === user.id;
  if (
    user.role !== "student" ||
    assignment.status !== "published" ||
    assignment.classStatus !== "active"
  )
    return false;
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM class_enrollments WHERE class_id=? AND student_id=? AND status='active'",
      )
      .get(assignment.classId, user.id),
  );
}
function requireAssignmentOwner(req, res, next) {
  const id = parsePositiveId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  }

  const assignment = db
    .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
    .get(id, req.user.id);

  if (!assignment) {
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  }

  req.assignmentId = id;
  next();
}
router.get("/", (req, res) => {
  if (req.user.role === "teacher") {
    const assignments = db
      .prepare(
        `${assignmentSelect} WHERE a.teacher_id=? AND a.status!='archived' ORDER BY a.created_at DESC`,
      )
      .all(req.user.id);
    return res.json({ assignments: assignments.map(withQuestions) });
  }
  if (req.user.role === "student") {
    const assignments = db
      .prepare(
        `${assignmentSelect} JOIN class_enrollments ce ON ce.class_id=a.class_id
      WHERE ce.student_id=? AND ce.status='active' AND c.status='active' AND a.status='published' ORDER BY a.due_at IS NULL, a.due_at ASC`,
      )
      .all(req.user.id);
    return res.json({ assignments: assignments.map(withQuestions) });
  }
  return res
    .status(403)
    .json({ error: { code: "FORBIDDEN", message: "Access denied." } });
});

// Students load assignments for a class when they open it from the dashboard.
router.get("/class/:id", requireRole("student"), (req, res) => {
  const classId = parsePositiveId(req.params.id);
  if (!classId) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Class ID must be a positive integer.",
      },
    });
  }

  const enrollment = db
    .prepare(
      `SELECT 1 FROM class_enrollments ce
       JOIN classes c ON c.id=ce.class_id
       WHERE ce.class_id=? AND ce.student_id=?
         AND ce.status='active' AND c.status='active'`,
    )
    .get(classId, req.user.id);

  if (!enrollment) {
    return res.status(404).json({
      error: { code: "CLASS_NOT_FOUND", message: "Class not found." },
    });
  }

  const assignments = db
    .prepare(
      `${assignmentSelect}
       JOIN class_enrollments ce ON ce.class_id=a.class_id
       WHERE a.class_id=? AND ce.student_id=? AND ce.status='active'
         AND c.status='active' AND a.status='published'
       ORDER BY a.due_at IS NULL, a.due_at ASC, a.created_at DESC`,
    )
    .all(classId, req.user.id);

  return res.json({ assignments: assignments.map(withQuestions) });
});

router.post("/", requireRole("teacher"), (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the assignment details.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  const input = parsed.data;
  if (
    input.questions.length &&
    Math.abs(
      input.questions.reduce((sum, q) => sum + q.marks, 0) - input.totalMarks,
    ) > 0.001
  ) {
    return res.status(400).json({
      error: {
        code: "QUESTION_MARKS_MISMATCH",
        message:
          "The sum of question marks must equal the assignment total marks.",
      },
    });
  }
  const klass = db
    .prepare(
      "SELECT id FROM classes WHERE id=? AND teacher_id=? AND status='active'",
    )
    .get(input.classId, req.user.id);
  if (!klass)
    return res.status(404).json({
      error: {
        code: "CLASS_NOT_FOUND",
        message: "An active class owned by you is required.",
      },
    });
  if (input.dueAt && Date.parse(input.dueAt) <= Date.now())
    return res.status(400).json({
      error: {
        code: "INVALID_DUE_DATE",
        message: "Due date must be in the future.",
      },
    });
  const result = db
    .prepare(
      "INSERT INTO assignments (class_id,teacher_id,title,instructions,questions_json,total_marks,due_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      input.classId,
      req.user.id,
      input.title,
      input.instructions,
      JSON.stringify(input.questions),
      input.totalMarks,
      input.dueAt ?? null,
    );
  writeAudit(
    db,
    req.user.id,
    "assignment.created",
    "assignment",
    result.lastInsertRowid,
  );
  return res.status(201).json({
    assignment: withQuestions(
      db
        .prepare(`${assignmentSelect} WHERE a.id=?`)
        .get(result.lastInsertRowid),
    ),
  });
});

// Teacher uploads the task attachment for an existing assignment.
router.post(
  "/:id/attachment",
  requireRole("teacher"),
  requireAssignmentOwner,
  assignmentAttachmentUpload.single("attachment"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message: "Please select a PDF, DOC, or DOCX file.",
        },
      });
    }

    const current = db
      .prepare(
        `SELECT attachment_stored_name AS storedName
         FROM assignments
         WHERE id=? AND teacher_id=?`,
      )
      .get(req.assignmentId, req.user.id);

    // Remove the previous attachment, if one exists.
    if (current?.storedName) {
      const previousPath = path.join(
        assignmentFilesDirectory,
        current.storedName,
      );

      if (fs.existsSync(previousPath)) {
        fs.unlinkSync(previousPath);
      }
    }

    db.prepare(
      `UPDATE assignments
       SET attachment_original_name=?,
           attachment_stored_name=?,
           attachment_mime_type=?,
           attachment_file_size=?,
           updated_at=datetime('now')
       WHERE id=? AND teacher_id=?`,
    ).run(
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      req.assignmentId,
      req.user.id,
    );

    return res.json({
      message: "Assignment attachment uploaded successfully.",
      attachment: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
      },
    });
  },
);

// Teacher or eligible student downloads the assignment task attachment.
router.get("/:id/attachment", (req, res) => {
  const id = parsePositiveId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  }

  const assignment = db
    .prepare(
      `${assignmentSelect}
       WHERE a.id=?`,
    )
    .get(id);

  if (!assignment) {
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  }

  if (!canViewAssignment(assignment, req.user)) {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "You cannot access this assignment.",
      },
    });
  }

  const attachment = db
    .prepare(
      `SELECT attachment_original_name AS originalName,
              attachment_stored_name AS storedName
       FROM assignments
       WHERE id=?`,
    )
    .get(id);

  if (!attachment?.storedName) {
    return res.status(404).json({
      error: {
        code: "ATTACHMENT_NOT_FOUND",
        message: "No task attachment is available.",
      },
    });
  }

  const filePath = path.join(assignmentFilesDirectory, attachment.storedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: {
        code: "FILE_NOT_FOUND",
        message: "The attachment file could not be found.",
      },
    });
  }

  return res.download(filePath, attachment.originalName || "assignment-task");
});

router.get("/:id", (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  const assignment = db.prepare(`${assignmentSelect} WHERE a.id=?`).get(id);
  if (!assignment)
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  if (!canViewAssignment(assignment, req.user))
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "You cannot access this assignment.",
      },
    });
  if (req.user.role === "student") delete assignment.teacherId;
  return res.json({ assignment: withQuestions(assignment) });
});

router.patch("/:id", requireRole("teacher"), (req, res) => {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  const parsed = assignmentUpdateSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Provide valid fields to update.",
        fields: parsed.error?.flatten().fieldErrors,
      },
    });
  const current = db
    .prepare(
      "SELECT id,status,due_at AS dueAt,total_marks AS totalMarks,questions_json AS questionsJson FROM assignments WHERE id=? AND teacher_id=? AND status IN ('draft','published','closed')",
    )
    .get(id, req.user.id);
  if (!current)
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Editable assignment not found.",
      },
    });
  let currentQuestions = [];
  try {
    currentQuestions = JSON.parse(current.questionsJson || "[]");
  } catch {}
  const nextQuestions = parsed.data.questions ?? currentQuestions;
  const nextTotalMarks = parsed.data.totalMarks ?? current.totalMarks;
  const changesGradingBasis =
    parsed.data.questions !== undefined || parsed.data.totalMarks !== undefined;
  if (
    parsed.data.questions !== undefined &&
    nextQuestions.length &&
    Math.abs(
      nextQuestions.reduce((sum, question) => sum + question.marks, 0) -
        nextTotalMarks,
    ) > 0.001
  )
    return res.status(400).json({
      error: {
        code: "QUESTION_MARKS_MISMATCH",
        message:
          "The sum of question marks must equal the assignment total marks.",
      },
    });
  if (
    current.status !== "draft" &&
    changesGradingBasis &&
    db.prepare(
      `SELECT 1 FROM submissions s
       WHERE s.assignment_id=? AND (
         s.grading_status!='ungraded' OR s.score IS NOT NULL OR EXISTS (
           SELECT 1 FROM submission_answers sa
           WHERE sa.submission_id=s.id
             AND (sa.grading_status!='ungraded' OR sa.score IS NOT NULL)
         )
       ) LIMIT 1`,
    ).get(id)
  ) {
    return res.status(409).json({
      error: {
        code: "ASSIGNMENT_RESULTS_LOCKED",
        message:
          "Questions or marks cannot be changed after grading has started. Save or release the current grades first, or create a new assignment.",
      },
    });
  }
  if (
    parsed.data.dueAt &&
    parsed.data.dueAt !== current.dueAt &&
    Date.parse(parsed.data.dueAt) <= Date.now()
  )
    return res.status(400).json({
      error: {
        code: "INVALID_DUE_DATE",
        message: "Due date must be in the future.",
      },
    });
  const sets = [];
  const params = [];
  const mapping = {
    title: "title",
    instructions: "instructions",
    totalMarks: "total_marks",
    dueAt: "due_at",
    questions: "questions_json",
  };
  for (const [key, column] of Object.entries(mapping))
    if (parsed.data[key] !== undefined) {
      sets.push(`${column}=?`);
      params.push(
        key === "questions"
          ? JSON.stringify(parsed.data[key])
          : parsed.data[key],
      );
    }
  sets.push("updated_at=datetime('now')");
  params.push(id, req.user.id);
  const updateAssignment = db.prepare(
    `UPDATE assignments SET ${sets.join(", ")} WHERE id=? AND teacher_id=?`,
  );
  const reconcileSubmissionAnswers = db.transaction(() => {
    updateAssignment.run(...params);
    if (parsed.data.questions !== undefined) {
      const submissions = db
        .prepare("SELECT id FROM submissions WHERE assignment_id=?")
        .all(id);
      const findAnswer = db.prepare(
        "SELECT id FROM submission_answers WHERE submission_id=? AND question_index=?",
      );
      const updateAnswer = db.prepare(
        `UPDATE submission_answers
         SET question_text=?,max_marks=?,updated_at=datetime('now')
         WHERE submission_id=? AND question_index=?`,
      );
      const insertAnswer = db.prepare(
        `INSERT INTO submission_answers
         (submission_id,question_index,question_text,max_marks,answer_text)
         VALUES (?,?,?,?, '')`,
      );
      const removeExtraAnswers = db.prepare(
        "DELETE FROM submission_answers WHERE submission_id=? AND question_index>=?",
      );
      const clearDraftSuggestions = db.prepare(
        "DELETE FROM ai_evaluations WHERE submission_id=?",
      );
      for (const submission of submissions) {
        parsed.data.questions.forEach((question, questionIndex) => {
          if (findAnswer.get(submission.id, questionIndex))
            updateAnswer.run(
              question.text,
              question.marks,
              submission.id,
              questionIndex,
            );
          else
            insertAnswer.run(
              submission.id,
              questionIndex,
              question.text,
              question.marks,
            );
        });
        removeExtraAnswers.run(submission.id, parsed.data.questions.length);
        clearDraftSuggestions.run(submission.id);
      }
    }
  });
  reconcileSubmissionAnswers();
  writeAudit(db, req.user.id, "assignment.updated", "assignment", id, {
    fields: Object.keys(parsed.data),
  });
  return res.json({
    assignment: withQuestions(
      db.prepare(`${assignmentSelect} WHERE a.id=?`).get(id),
    ),
  });
});

router.post("/:id/publish", requireRole("teacher"), (req, res) =>
  changeStatus(req, res, "published"),
);
router.post("/:id/close", requireRole("teacher"), (req, res) =>
  changeStatus(req, res, "closed"),
);

router.delete("/:id", requireRole("teacher"), (req, res) => {
  const id = parsePositiveId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  }

  const assignment = db
    .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
    .get(id, req.user.id);

  if (!assignment) {
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  }

  try {
    db.prepare("DELETE FROM assignments WHERE id=? AND teacher_id=?").run(
      id,
      req.user.id,
    );

    writeAudit(db, req.user.id, "assignment.deleted", "assignment", id);

    return res.json({
      message: "Assignment deleted successfully.",
    });
  } catch (error) {
    console.error("Assignment delete error:", error);

    return res.status(500).json({
      error: {
        code: "ASSIGNMENT_DELETE_FAILED",
        message:
          "Assignment could not be deleted. It may have related submissions.",
      },
    });
  }
});
function changeStatus(req, res, status) {
  const id = parsePositiveId(req.params.id);
  if (!id)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  const current = db
    .prepare(
      "SELECT a.id,a.status,a.class_id AS classId,c.status AS classStatus FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=? AND a.teacher_id=?",
    )
    .get(id, req.user.id);
  if (!current)
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  if (status === "published") {
    if (current.status !== "draft")
      return res.status(409).json({
        error: {
          code: "INVALID_STATE",
          message: "Only draft assignments can be published.",
        },
      });
    if (current.classStatus !== "active")
      return res.status(409).json({
        error: {
          code: "CLASS_ARCHIVED",
          message: "Assignments in archived classes cannot be published.",
        },
      });
    const row = db
      .prepare("SELECT due_at AS dueAt FROM assignments WHERE id=?")
      .get(id);
    if (row.dueAt && Date.parse(row.dueAt) <= Date.now())
      return res.status(400).json({
        error: {
          code: "INVALID_DUE_DATE",
          message: "Choose a future due date before publishing.",
        },
      });
  } else if (status === "closed" && current.status !== "published") {
    return res.status(409).json({
      error: {
        code: "INVALID_STATE",
        message: "Only published assignments can be closed.",
      },
    });
  }

  const publishedAt =
    status === "published" ? ", published_at=datetime('now')" : "";
  db.prepare(
    `UPDATE assignments SET status=?, updated_at=datetime('now')${publishedAt} WHERE id=? AND teacher_id=?`,
  ).run(status, id, req.user.id);
  writeAudit(db, req.user.id, `assignment.${status}`, "assignment", id);
  if (status === "published") {
    const recipients = db
      .prepare(
        "SELECT student_id AS id FROM class_enrollments WHERE class_id=? AND status='active'",
      )
      .all(current.classId)
      .map((row) => row.id);
    const assignmentTitle =
      db.prepare("SELECT title FROM assignments WHERE id=?").get(id)?.title ||
      "New assignment";
    notifyMany(
      recipients,
      "assignment_published",
      "New assignment published",
      `${assignmentTitle} is now available in your class.`,
      "assignment",
      id,
    );
  }
  return res.json({
    assignment: withQuestions(
      db.prepare(`${assignmentSelect} WHERE a.id=?`).get(id),
    ),
  });
}

export default router;
