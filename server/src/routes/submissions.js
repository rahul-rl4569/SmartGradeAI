import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import mammoth from "mammoth";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAudit, parsePositiveId } from "../services.js";
import { env } from "../config/env.js";
import { notify } from "../notifications.js";
import {
  generateGradingDraft,
  GradingProviderError,
} from "../grading/provider.js";
import { analyzeSubmissionAuthenticity } from "../grading/authenticityReview.js";
import {
  extractPdfTextWithVision,
  VisionExtractionError,
} from "../grading/visionExtraction.js";

const router = Router();
router.use(requireAuth);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const crc32Table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

async function* makeZip(entries) {
  let offset = 0;
  const directory = [];

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const localOffset = offset;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0808, 6); // UTF-8 filename and data descriptor
    localHeader.writeUInt16LE(0, 8); // Store without compression
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12); // 1980-01-01
    localHeader.writeUInt16LE(name.length, 26);
    const localParts = [localHeader, name];
    for (const part of localParts) {
      offset += part.length;
      yield part;
    }

    let crc = 0xffffffff;
    let size = 0;
    for await (const chunk of fs.createReadStream(entry.path)) {
      size += chunk.length;
      for (const byte of chunk)
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      offset += chunk.length;
      yield chunk;
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    offset += descriptor.length;
    yield descriptor;

    directory.push({ name, crc, size, offset: localOffset });
  }

  const directoryStart = offset;
  for (const entry of directory) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0808, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0x0021, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt32LE(entry.offset, 42);
    offset += header.length + entry.name.length;
    yield header;
    yield entry.name;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(offset - directoryStart, 12);
  end.writeUInt32LE(directoryStart, 16);
  yield end;
}

const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);

const assignmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadDir);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 2,
    fieldSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return callback(new Error("Only PDF, DOC, and DOCX files are allowed."));
    }

    callback(null, true);
  },
});

async function extractSubmissionText(file, submissionId) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === ".pdf")
    return extractPdfTextWithVision({
      filePath: file.path,
      submissionId,
    });
  if (extension === ".docx") {
    const parsed = await mammoth.extractRawText({ path: file.path });
    return {
      text: (parsed.value || "").replace(/\u0000/g, "").trim().slice(0, 50000),
      flags: [],
      provider: "mammoth",
    };
  }
  return { text: "", flags: [], provider: "unsupported" };
}

function splitExtractedAnswers(text, questions) {
  const segments = new Map();
  let currentIndex = -1;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[).:\-]\s*(.*)$/i);
    if (match) {
      currentIndex = Number(match[1]) - 1;
      if (currentIndex >= 0 && currentIndex < questions.length)
        segments.set(currentIndex, match[2] || "");
    } else if (currentIndex >= 0 && currentIndex < questions.length) {
      const previous = segments.get(currentIndex) || "";
      segments.set(currentIndex, `${previous}${previous ? "\n" : ""}${line}`);
    }
  }
  return segments;
}

const answerSchema = z
  .object({
    answerText: z.string().trim().max(50000).optional().default(""),
    answers: z
      .array(
        z
          .object({
            questionIndex: z.number().int().nonnegative(),
            answerText: z.string().trim().max(20000),
          })
          .strict(),
      )
      .max(200)
      .optional(),
  })
  .strict();
const assignmentForStudent =
  db.prepare(`SELECT a.id,a.class_id AS classId,a.title,a.status,a.due_at AS dueAt,c.status AS classStatus
 FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=?`);
const studentEnrolled = db.prepare(
  "SELECT 1 FROM class_enrollments WHERE class_id=? AND student_id=? AND status='active'",
);

router.get("/mine", requireRole("student"), (req, res) => {
  const submissions = db
    .prepare(
      `SELECT s.id,s.assignment_id AS assignmentId,s.answer_text AS answerText,
    s.file_name AS fileName,s.extraction_status AS extractionStatus,s.status,s.submitted_at AS submittedAt,s.updated_at AS updatedAt,
    CASE WHEN s.grading_status='released' THEN s.score ELSE NULL END AS score,
    CASE WHEN s.grading_status='released' THEN s.feedback ELSE NULL END AS feedback,
    s.grading_status AS gradingStatus,
    a.questions_json AS questionsJson,
    a.title AS assignmentTitle,a.total_marks AS totalMarks,a.due_at AS dueAt,c.name AS className,c.subject AS classSubject
    FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN classes c ON c.id=a.class_id
    WHERE s.student_id=? ORDER BY s.updated_at DESC`,
    )
    .all(req.user.id);
  const answerRows = db.prepare(
    `SELECT question_index AS questionIndex,question_text AS questionText,max_marks AS maxMarks,answer_text AS answerText,CASE WHEN grading_status='released' THEN score ELSE NULL END AS score,CASE WHEN grading_status='released' THEN feedback ELSE NULL END AS feedback,grading_status AS gradingStatus FROM submission_answers WHERE submission_id=? ORDER BY question_index`,
  );
  const feedbackHistoryRows = db.prepare(
    `SELECT id,scope,question_index AS questionIndex,score,max_marks AS maxMarks,feedback,released_at AS releasedAt FROM submission_feedback_history WHERE submission_id=? ORDER BY released_at DESC,id DESC`,
  );
  for (const item of submissions) {
    item.answers = answerRows.all(item.id);
    item.feedbackHistory = feedbackHistoryRows.all(item.id);
    if (
      item.fileName &&
      item.extractionStatus === "extracted"
    ) {
      item.answerText = "File submission";
      item.answers = item.answers.map((answer) => ({
        ...answer,
        answerText: "",
      }));
    }
    try {
      item.questions = JSON.parse(item.questionsJson || "[]");
    } catch {
      item.questions = [];
    }
    delete item.questionsJson;
  }
  return res.json({ submissions });
});

// Students may preview only their own previously submitted assignment file.
router.get("/mine/:submissionId/preview", requireRole("student"), async (req, res) => {
  const submissionId = parsePositiveId(req.params.submissionId);
  if (!submissionId)
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "Invalid submission ID." },
    });

  const item = db
    .prepare(
      `SELECT file_name AS fileName,stored_file_name AS storedFileName,
              file_mime_type AS fileMimeType
       FROM submissions WHERE id=? AND student_id=?`,
    )
    .get(submissionId, req.user.id);
  if (!item?.storedFileName || !item.fileName)
    return res.status(404).json({
      error: { code: "FILE_NOT_FOUND", message: "Submitted file was not found." },
    });

  const filePath = path.resolve(uploadDir, item.storedFileName);
  if (path.dirname(filePath) !== path.resolve(uploadDir) || !fs.existsSync(filePath))
    return res.status(404).json({
      error: { code: "FILE_NOT_FOUND", message: "Submitted file was not found." },
    });

  res.set("Cache-Control", "private, no-store");
  if (path.extname(item.fileName).toLowerCase() === ".docx") {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return res.type("text/plain").send(result.value || "No readable text found in this DOCX file.");
    } catch {
      return res.status(422).json({
        error: { code: "PREVIEW_FAILED", message: "This DOCX file could not be previewed." },
      });
    }
  }

  res.set("Content-Disposition", "inline");
  return res.type(item.fileMimeType || "application/octet-stream").sendFile(filePath);
});

router.post("/:assignmentId", requireRole("student"), (req, res) => {
  assignmentUpload.single("assignmentFile")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        error: {
          code: "FILE_UPLOAD_ERROR",
          message: uploadError.message || "File upload failed.",
        },
      });
    }

    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId)
      return res.status(400).json({
        error: {
          code: "INVALID_ID",
          message: "Assignment ID must be a positive integer.",
        },
      });
    if (!req.file) {
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message: "Please upload an assignment file.",
        },
      });
    }

    let submittedAnswers = req.body?.answers;
    if (typeof submittedAnswers === "string") {
      try {
        submittedAnswers = JSON.parse(submittedAnswers);
      } catch {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          error: {
            code: "INVALID_ANSWERS",
            message: "The submitted question answers could not be read.",
          },
        });
      }
    }
    const parsed = answerSchema.safeParse({
      answerText: req.body?.answerText || "",
      answers: submittedAnswers,
    });
    if (!parsed.success) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        error: {
          code: "INVALID_ANSWERS",
          message: "Check the submitted answers and try again.",
        },
      });
    }
    const assignment = assignmentForStudent.get(assignmentId);
    if (
      !assignment ||
      assignment.status !== "published" ||
      assignment.classStatus !== "active" ||
      !studentEnrolled.get(assignment.classId, req.user.id)
    ) {
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_AVAILABLE",
          message:
            "This published assignment is not available to your account.",
        },
      });
    }
    if (assignment.dueAt && Date.parse(assignment.dueAt) < Date.now())
      return res.status(409).json({
        error: {
          code: "SUBMISSION_CLOSED",
          message: "The due date has passed. Your answer was not submitted.",
        },
      });
    const assignmentFull = db
      .prepare(
        "SELECT questions_json AS questionsJson FROM assignments WHERE id=?",
      )
      .get(assignmentId);
    let questions = [];
    try {
      questions = JSON.parse(assignmentFull?.questionsJson || "[]");
    } catch {}
    // Keep document processing deferred until the teacher requests a grading
    // suggestion. The uploaded original is stored unchanged in the meantime.
    const extractedText = "";
    const extractionStatus = "not_processed";

    const typedAnswers = new Map(
      (parsed.data.answers || []).map((item) => [
        item.questionIndex,
        item.answerText.trim(),
      ]),
    );
    if (
      [...typedAnswers.keys()].some(
        (questionIndex) => questionIndex >= questions.length,
      )
    ) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        error: {
          code: "INVALID_QUESTION_INDEX",
          message: "An answer refers to a question that is not in this assignment.",
        },
      });
    }
    const submissionAnswerRows = questions.map((question, questionIndex) => ({
      questionIndex,
      questionText: question.text,
      maxMarks: Number(question.marks),
      answerText: typedAnswers.get(questionIndex) || "",
    }));
    const hasTypedAnswer = [...typedAnswers.values()].some(Boolean);
    const evaluationFlags = [];
    if (
      hasTypedAnswer &&
      questions.length &&
      submissionAnswerRows.some((answer) => !answer.answerText)
    ) {
      evaluationFlags.push({
        code: "missing_answers",
        severity: "notice",
        message: "One or more assignment questions have no typed answer.",
      });
    }
    const specializedQuestionNumbers = submissionAnswerRows
      .filter((answer) =>
        /\b(calculate|solve|equation|proof|program|programming|code|algorithm|debug)\b/i.test(
          answer.questionText,
        ),
      )
      .map((answer) => answer.questionIndex + 1);
    if (specializedQuestionNumbers.length) {
      evaluationFlags.push({
        code: "specialized_check_required",
        severity: "review",
        message: `Question${specializedQuestionNumbers.length === 1 ? "" : "s"} ${specializedQuestionNumbers.join(", ")} may require math or code verification. No automatic math checker or code sandbox is configured; verify these answers manually.`,
      });
    }
    const answerText = submissionAnswerRows.some((answer) => answer.answerText)
      ? submissionAnswerRows
          .filter((answer) => answer.answerText)
          .map((answer) => `Question ${answer.questionIndex + 1}:\n${answer.answerText}`)
          .join("\n\n")
          .slice(0, 50000)
      : (parsed.data.answerText || "File submission").slice(
          0,
          50000,
        );
    const transaction = db.transaction(() => {
      const existing = db
        .prepare(
          "SELECT id, status, stored_file_name FROM submissions WHERE assignment_id=? AND student_id=?",
        )
        .get(assignmentId, req.user.id);
      let submissionId;
      if (existing) {
        submissionId = existing.id;
        db.prepare(
          `UPDATE submissions SET answer_text=?,extracted_text='',extraction_status='not_processed',evaluation_flags_json='[]',file_name=?,stored_file_name=?,file_mime_type=?,file_size=?,status='resubmitted',score=NULL,feedback=NULL,grading_status='ungraded',graded_by=NULL,graded_at=NULL,submitted_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
        ).run(
          answerText,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          submissionId,
        );
        db.prepare("DELETE FROM submission_answers WHERE submission_id=?").run(
          submissionId,
        );
        db.prepare("DELETE FROM ai_evaluations WHERE submission_id=?").run(
          submissionId,
        );
      } else {
        const result = db
          .prepare(
            `INSERT INTO submissions (assignment_id,student_id,answer_text,status,file_name,stored_file_name,file_mime_type,file_size,extracted_text,extraction_status,evaluation_flags_json)
             VALUES (?,?,?,'submitted',?,?,?,?,?,?,?)`,
          )
          .run(
            assignmentId,
            req.user.id,
            answerText,
            req.file.originalname,
            req.file.filename,
            req.file.mimetype,
            req.file.size,
            extractedText,
            extractionStatus,
            JSON.stringify(evaluationFlags),
          );
        submissionId = result.lastInsertRowid;
      }

      const insertAnswer = db.prepare(
        `INSERT INTO submission_answers
         (submission_id,question_index,question_text,max_marks,answer_text)
         VALUES (@submissionId,@questionIndex,@questionText,@maxMarks,@answerText)`,
      );
      for (const answer of submissionAnswerRows)
        insertAnswer.run({ submissionId, ...answer });

      return { existing: Boolean(existing), submissionId };
    });
    const saved = transaction();
    writeAudit(
      db,
      req.user.id,
      saved.existing ? "submission.updated" : "submission.created",
      "assignment",
      assignmentId,
    );
    if (!saved.existing) {
      const owner = db
        .prepare(
          "SELECT teacher_id AS teacherId,title FROM assignments WHERE id=?",
        )
        .get(assignmentId);
      const studentName =
        db
          .prepare("SELECT full_name AS fullName FROM users WHERE id=?")
          .get(req.user.id)?.fullName || "A student";
      if (owner)
        notify(
          owner.teacherId,
          "submission_received",
          "New student submission",
          `${studentName} submitted an answer for ${owner.title}.`,
          "assignment",
          assignmentId,
        );
    }
    const submission = db
      .prepare(
        `SELECT id,assignment_id AS assignmentId,answer_text AS answerText,status,submitted_at AS submittedAt,updated_at AS updatedAt FROM submissions WHERE id=?`,
      )
      .get(saved.submissionId);
    submission.answers = db
      .prepare(
        "SELECT question_index AS questionIndex,question_text AS questionText,max_marks AS maxMarks,answer_text AS answerText FROM submission_answers WHERE submission_id=? ORDER BY question_index",
      )
      .all(saved.submissionId);
    return res.status(saved.existing ? 200 : 201).json({
      message: saved.existing
        ? "Your answer was updated."
        : "Your answer was submitted.",
      submission,
    });
  });
});

router.get("/assignment/:assignmentId", requireRole("teacher"), (req, res) => {
  const assignmentId = parsePositiveId(req.params.assignmentId);
  if (!assignmentId)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  const assignment = db
    .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
    .get(assignmentId, req.user.id);
  if (!assignment)
    return res.status(404).json({
      error: {
        code: "ASSIGNMENT_NOT_FOUND",
        message: "Assignment not found.",
      },
    });
  const submissions = db
    .prepare(
      `SELECT
  s.id,
  s.student_id AS studentId,
  u.full_name AS studentName,
  u.email AS studentEmail,
  s.answer_text AS answerText,
  s.extracted_text AS extractedText,
  s.extraction_status AS extractionStatus,
  s.evaluation_flags_json AS evaluationFlagsJson,
  s.file_name AS fileName,
  s.file_size AS fileSize,
  s.file_mime_type AS fileMimeType,
  s.status,
  s.submitted_at AS submittedAt,
  s.updated_at AS updatedAt,
  s.score,
  s.feedback,
  s.grading_status AS gradingStatus,
  s.graded_at AS gradedAt
FROM submissions s
JOIN users u ON u.id=s.student_id
WHERE s.assignment_id=?
ORDER BY s.submitted_at DESC`,
    )
    .all(assignmentId);
  const answerRows = db.prepare(
    "SELECT question_index AS questionIndex,question_text AS questionText,max_marks AS maxMarks,answer_text AS answerText,score,feedback,grading_status AS gradingStatus FROM submission_answers WHERE submission_id=? ORDER BY question_index",
  );
  const latestEvaluation = db.prepare(
    `SELECT id,provider,model,suggested_score AS score,total_marks AS totalMarks,
     confidence,feedback,strengths_json AS strengthsJson,
     improvements_json AS improvementsJson,rationale,flags_json AS flagsJson,
     question_suggestions_json AS questionSuggestionsJson,
     created_at AS createdAt FROM ai_evaluations
     WHERE submission_id=? ORDER BY created_at DESC,id DESC LIMIT 1`,
  );
  for (const item of submissions) {
    item.answers = answerRows.all(item.id);
    // Keep selectable document text available only to the teacher review flow.
    if (
      item.fileName &&
      item.extractionStatus === "extracted"
    ) {
      item.answerText = "File submission";
      item.answers = item.answers.map((answer) => ({
        ...answer,
        answerText: "",
      }));
    } else {
      item.extractedText = "";
    }
    try {
      item.evaluationFlags = JSON.parse(item.evaluationFlagsJson || "[]");
    } catch {
      item.evaluationFlags = [];
    }
    delete item.evaluationFlagsJson;
    const evaluation = latestEvaluation.get(item.id);
    if (evaluation) {
      try {
        item.aiSuggestion = {
          evaluationId: evaluation.id,
          score: evaluation.score,
          totalMarks: evaluation.totalMarks,
          confidence: evaluation.confidence,
          feedback: evaluation.feedback,
          strengths: JSON.parse(evaluation.strengthsJson || "[]"),
          improvements: JSON.parse(evaluation.improvementsJson || "[]"),
          rationale: evaluation.rationale,
          flags: JSON.parse(evaluation.flagsJson || "[]"),
          questions: JSON.parse(evaluation.questionSuggestionsJson || "[]"),
          provider: evaluation.provider,
          model: evaluation.model,
          createdAt: evaluation.createdAt,
        };
      } catch {
        item.aiSuggestion = null;
      }
    } else {
      item.aiSuggestion = null;
    }
  }
  return res.json({ submissions });
});

// Teacher-only roster for an assignment, including students who have not submitted.
router.get(
  "/assignment/:assignmentId/roster",
  requireRole("teacher"),
  (req, res) => {
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId)
      return res.status(400).json({
        error: {
          code: "INVALID_ID",
          message: "Assignment ID must be a positive integer.",
        },
      });

    const assignment = db
      .prepare(
        "SELECT id,due_at AS dueAt,total_marks AS totalMarks FROM assignments WHERE id=? AND teacher_id=?",
      )
      .get(assignmentId, req.user.id);
    if (!assignment)
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Assignment not found.",
        },
      });

    const students = db
      .prepare(
        `SELECT u.id AS studentId,u.full_name AS studentName,
              u.roll_number AS rollNumber,u.email AS studentEmail,
              s.id AS submissionId,s.submitted_at AS submittedAt,
              s.file_name AS fileName,s.score,s.feedback,
              s.grading_status AS gradingStatus
       FROM assignments a
       JOIN class_enrollments ce ON ce.class_id=a.class_id AND ce.status='active'
       JOIN users u ON u.id=ce.student_id
       LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=u.id
       WHERE a.id=?
       ORDER BY u.full_name COLLATE NOCASE`,
      )
      .all(assignmentId)
      .map((student) => {
        const submitted = Boolean(student.submissionId);
        const submittedTime = student.submittedAt
          ? Date.parse(
              `${student.submittedAt}${student.submittedAt.endsWith("Z") ? "" : "Z"}`,
            )
          : NaN;
        const dueTime = assignment.dueAt ? Date.parse(assignment.dueAt) : NaN;
        const late =
          submitted && Number.isFinite(dueTime) && submittedTime > dueTime;
        return {
          ...student,
          status: !submitted
            ? "not_submitted"
            : late
              ? "late_submitted"
              : "submitted",
          totalMarks: assignment.totalMarks,
        };
      });

    return res.json({ assignment, students });
  },
);

// Teacher-only ZIP download of all submitted files for one assignment.
router.get(
  "/assignment/:assignmentId/files.zip",
  requireRole("teacher"),
  (req, res) => {
    const assignmentId = parsePositiveId(req.params.assignmentId);
    if (!assignmentId)
      return res.status(400).json({
        error: {
          code: "INVALID_ID",
          message: "Assignment ID must be a positive integer.",
        },
      });

    const assignment = db
      .prepare("SELECT id,title FROM assignments WHERE id=? AND teacher_id=?")
      .get(assignmentId, req.user.id);
    if (!assignment)
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Assignment not found.",
        },
      });

    const rows = db
      .prepare(
        `SELECT s.stored_file_name AS storedFileName,s.file_name AS fileName,
                u.id AS studentId,u.full_name AS studentName,
                u.roll_number AS rollNumber
         FROM submissions s
         JOIN assignments a ON a.id=s.assignment_id
         JOIN users u ON u.id=s.student_id
         WHERE a.id=? AND a.teacher_id=? AND s.stored_file_name IS NOT NULL
         ORDER BY u.full_name COLLATE NOCASE`,
      )
      .all(assignmentId, req.user.id);

    const entries = rows
      .map((row) => {
        const filePath = path.resolve(uploadDir, row.storedFileName);
        if (path.dirname(filePath) !== uploadDir || !fs.existsSync(filePath))
          return null;
        const safeName = (value) =>
          String(value || "student")
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
            .trim()
            .slice(0, 100);
        const originalName = path.basename(row.fileName || "submission-file");
        return {
          path: filePath,
          name: `${safeName(row.rollNumber || row.studentId)}-${safeName(row.studentName)}-${safeName(originalName)}`,
        };
      })
      .filter(Boolean);

    if (!entries.length)
      return res.status(404).json({
        error: {
          code: "NO_SUBMISSION_FILES",
          message:
            "There are no submitted files to download for this assignment.",
        },
      });

    const archiveName = `assignment-${assignmentId}-submissions.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${archiveName}"`,
    );
    const archive = Readable.from(makeZip(entries));
    archive.on("error", (error) => {
      console.error("Could not stream assignment ZIP:", error.message);
      res.destroy(error);
    });
    archive.pipe(res);
  },
);

// Teacher-only: download a student's submitted assignment file.
router.get("/:submissionId/file", requireRole("teacher"), (req, res) => {
  const submissionId = parsePositiveId(req.params.submissionId);

  if (!submissionId) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Invalid submission ID.",
      },
    });
  }

  const item = db
    .prepare(
      `SELECT s.file_name AS fileName,
              s.stored_file_name AS storedFileName
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = ? AND a.teacher_id = ?`,
    )
    .get(submissionId, req.user.id);

  if (!item || !item.storedFileName || !item.fileName) {
    return res.status(404).json({
      error: {
        code: "FILE_NOT_FOUND",
        message: "Submitted file was not found.",
      },
    });
  }

  const filePath = path.resolve(uploadDir, item.storedFileName);

  if (
    path.dirname(filePath) !== path.resolve(uploadDir) ||
    !fs.existsSync(filePath)
  ) {
    return res.status(404).json({
      error: {
        code: "FILE_NOT_FOUND",
        message: "Submitted file was not found.",
      },
    });
  }

  return res.download(filePath, path.basename(item.fileName));
});

// Teacher-only inline preview of a student's uploaded submission.
router.get("/:submissionId/preview", requireRole("teacher"), async (req, res) => {
  const submissionId = parsePositiveId(req.params.submissionId);
  if (!submissionId)
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "Invalid submission ID." },
    });

  const item = db
    .prepare(
      `SELECT s.file_name AS fileName,s.stored_file_name AS storedFileName,
              s.file_mime_type AS fileMimeType
       FROM submissions s
       JOIN assignments a ON a.id=s.assignment_id
       WHERE s.id=? AND a.teacher_id=?`,
    )
    .get(submissionId, req.user.id);
  if (!item?.storedFileName || !item.fileName)
    return res.status(404).json({
      error: { code: "FILE_NOT_FOUND", message: "Submitted file was not found." },
    });

  const filePath = path.resolve(uploadDir, item.storedFileName);
  if (path.dirname(filePath) !== path.resolve(uploadDir) || !fs.existsSync(filePath))
    return res.status(404).json({
      error: { code: "FILE_NOT_FOUND", message: "Submitted file was not found." },
    });

  const extension = path.extname(item.fileName).toLowerCase();
  res.set("Cache-Control", "private, no-store");
  if (extension === ".docx") {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return res.type("text/plain").send(result.value || "No readable text found in this DOCX file.");
    } catch {
      return res.status(422).json({
        error: { code: "PREVIEW_FAILED", message: "This DOCX file could not be previewed." },
      });
    }
  }

  res.set("Content-Disposition", "inline");
  return res.type(item.fileMimeType || "application/octet-stream").sendFile(filePath);
});

// Teacher-only per-question grading. The submission owner is checked before writes.
const questionGradeSchema = z
  .object({
    score: z.number().min(0).max(10000),
    feedback: z.string().trim().max(5000).optional().default(""),
    release: z.boolean().optional().default(false),
  })
  .strict();
router.patch(
  "/:submissionId/answers/:questionIndex/grade",
  requireRole("teacher"),
  (req, res) => {
    const submissionId = parsePositiveId(req.params.submissionId);
    const questionIndex = Number(req.params.questionIndex);
    if (!submissionId || !Number.isInteger(questionIndex) || questionIndex < 0)
      return res.status(400).json({
        error: {
          code: "INVALID_ID",
          message: "Submission and question IDs must be valid.",
        },
      });
    const parsed = questionGradeSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Enter a valid question score and feedback.",
        },
      });
    const row = db
      .prepare(
        `SELECT sa.id,sa.max_marks AS maxMarks,a.total_marks AS assignmentTotalMarks,a.teacher_id AS teacherId FROM submission_answers sa JOIN submissions s ON s.id=sa.submission_id JOIN assignments a ON a.id=s.assignment_id WHERE sa.submission_id=? AND sa.question_index=?`,
      )
      .get(submissionId, questionIndex);
    if (!row || row.teacherId !== req.user.id)
      return res.status(404).json({
        error: {
          code: "ANSWER_NOT_FOUND",
          message: "Question answer not found in your assignments.",
        },
      });
    if (parsed.data.score > row.maxMarks)
      return res.status(400).json({
        error: {
          code: "SCORE_EXCEEDS_TOTAL",
          message: `Score cannot exceed ${row.maxMarks} marks.`,
        },
      });
    const status = parsed.data.release ? "released" : "draft";
    db.prepare(
      `UPDATE submission_answers SET score=?,feedback=?,grading_status=?,graded_by=?,graded_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
    ).run(parsed.data.score, parsed.data.feedback, status, req.user.id, row.id);
    if (parsed.data.release)
      db.prepare(
        `INSERT INTO submission_feedback_history (submission_id,scope,question_index,score,max_marks,feedback,released_by) VALUES (?,'question',?,?,?,?,?)`,
      ).run(
        submissionId,
        questionIndex,
        parsed.data.score,
        row.maxMarks,
        parsed.data.feedback,
        req.user.id,
      );
    const answerSummary = db
      .prepare(
        `SELECT question_index AS questionIndex,score,feedback,grading_status AS gradingStatus FROM submission_answers WHERE submission_id=? ORDER BY question_index`,
      )
      .all(submissionId);
    const allReleased =
      answerSummary.length > 0 &&
      answerSummary.every((answer) => answer.gradingStatus === "released");
    if (allReleased) {
      const totalScore = answerSummary.reduce(
        (sum, answer) => sum + Number(answer.score || 0),
        0,
      );
      const overallFeedback = answerSummary
        .map(
          (answer) =>
            `Q${answer.questionIndex + 1}: ${answer.feedback || "No additional feedback."}`,
        )
        .join("\n");
      db.prepare(
        `UPDATE submissions SET score=?,feedback=?,grading_status='released',graded_by=?,graded_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
      ).run(totalScore, overallFeedback, req.user.id, submissionId);
      db.prepare(
        `INSERT INTO submission_feedback_history (submission_id,scope,score,max_marks,feedback,released_by) VALUES (?,'overall',?,?,?,?)`,
      ).run(
        submissionId,
        totalScore,
        row.assignmentTotalMarks,
        overallFeedback,
        req.user.id,
      );
    } else {
      db.prepare(
        `UPDATE submissions SET grading_status=CASE WHEN grading_status='released' THEN 'draft' ELSE grading_status END,updated_at=datetime('now') WHERE id=?`,
      ).run(submissionId);
    }
    writeAudit(
      db,
      req.user.id,
      parsed.data.release
        ? "submission.question_grade_released"
        : "submission.question_grade_saved",
      "submission",
      submissionId,
      { questionIndex, score: parsed.data.score },
    );
    if (allReleased && parsed.data.release) {
      const student = db
        .prepare(
          "SELECT s.student_id AS studentId,a.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?",
        )
        .get(submissionId);
      if (student)
        notify(
          student.studentId,
          "grade_released",
          "Assessment results released",
          `Your results for ${student.title} are now available.`,
          "submission",
          submissionId,
        );
    }
    return res.json({
      message: allReleased
        ? "All question results are released; the overall score has been calculated."
        : parsed.data.release
          ? "Question grade released."
          : "Question grade saved privately.",
      answer: db
        .prepare(
          "SELECT question_index AS questionIndex,score,feedback,grading_status AS gradingStatus FROM submission_answers WHERE id=?",
        )
        .get(row.id),
      allQuestionsReleased: allReleased,
    });
  },
);

const aiSuggestSchema = z
  .object({
    rubric: z.string().trim().max(5000).optional().default(""),
  })
  .strict();

// AI output is a teacher-only draft. It is never saved or released automatically.
router.post(
  "/:submissionId/ai-suggest",
  requireRole("teacher"),
  async (req, res) => {
    const submissionId = parsePositiveId(req.params.submissionId);
    if (!submissionId)
      return res.status(400).json({
        error: {
          code: "INVALID_ID",
          message: "Submission ID must be a positive integer.",
        },
      });
    const parsed = aiSuggestSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Rubric must be 5,000 characters or fewer.",
        },
      });
    const row = db
      .prepare(
        `SELECT s.id,s.answer_text AS answerText,s.extracted_text AS extractedText,
        s.extraction_status AS extractionStatus,s.evaluation_flags_json AS evaluationFlagsJson,
        s.file_name AS fileName,s.stored_file_name AS storedFileName,
        s.file_mime_type AS fileMimeType,s.file_size AS fileSize,
        s.assignment_id AS assignmentId,a.title,a.instructions,a.questions_json AS questionsJson,a.total_marks AS totalMarks,a.teacher_id AS teacherId
    FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?`,
      )
      .get(submissionId);
    if (!row || row.teacherId !== req.user.id)
      return res.status(404).json({
        error: {
          code: "SUBMISSION_NOT_FOUND",
          message: "Submission not found in your assignments.",
        },
      });
    let questionAnswers = db
      .prepare(
        `SELECT question_index AS questionIndex,question_text AS questionText,
         max_marks AS maxMarks,answer_text AS answerText FROM submission_answers
         WHERE submission_id=? ORDER BY question_index`,
      )
      .all(submissionId);
    let assignmentQuestions = [];
    let evaluationFlags = [];
    try {
      assignmentQuestions = JSON.parse(row.questionsJson || "[]");
    } catch {}
    try {
      evaluationFlags = JSON.parse(row.evaluationFlagsJson || "[]");
    } catch {}
    const hasTextAnswer = questionAnswers.some((answer) => answer.answerText.trim());
    const isPdfSubmission = path.extname(row.fileName || "").toLowerCase() === ".pdf";
    const hasVisionExtraction = evaluationFlags.some(
      (flag) => flag.code === "vision_extraction",
    );
    const shouldRefreshLegacyPdfExtraction =
      isPdfSubmission &&
      !hasVisionExtraction &&
      row.extractionStatus === "extracted";
    let evaluationText = (
      (row.extractionStatus === "extracted" ? row.extractedText : "") ||
      (row.answerText === "File submission" ? "" : row.answerText) ||
      ""
    ).trim();

    // Process an uploaded document only after the teacher clicks Generate.
    // The original file stays in uploads; extraction and question matching run
    // entirely on the server.
    if (
      row.storedFileName &&
      ((!hasTextAnswer && !evaluationText) || shouldRefreshLegacyPdfExtraction)
    ) {
      const filePath = path.resolve(uploadDir, row.storedFileName);
      if (
        path.dirname(filePath) !== path.resolve(uploadDir) ||
        !fs.existsSync(filePath)
      )
        return res.status(404).json({
          error: {
            code: "FILE_NOT_FOUND",
            message: "The submitted file could not be found for processing.",
          },
        });

      // A new extraction replaces any flags and transcription state from an
      // older pipeline; authenticity flags are recalculated below.
      evaluationFlags = evaluationFlags.filter((flag) =>
        flag.code?.startsWith("authenticity_"),
      );
      let extractionStatus = "extracted";
      try {
        const extraction = await extractSubmissionText({
          path: filePath,
          originalname: row.fileName,
        }, submissionId);
        evaluationText = extraction.text;
        if (extraction.provider === "google-cloud-vision")
          evaluationFlags.push({
            code: "vision_extraction",
            severity: "notice",
            message:
              "Text was extracted from the submitted PDF using Google Cloud Vision. Verify it against the original before grading.",
          });
        evaluationFlags.push(...(extraction.flags || []));
      } catch (error) {
        console.error("Submission text extraction failed:", error?.message);
        evaluationText = "";
        if (error instanceof VisionExtractionError && error.code === "VISION_NOT_CONFIGURED") {
          return res.status(error.status).json({
            error: { code: error.code, message: error.message },
          });
        }
        evaluationFlags.push({
          code: "extraction_error",
          severity: "review",
          message: "The uploaded document could not be processed. Check the original file before grading.",
        });
        db.prepare(
          `UPDATE submissions SET extracted_text='',extraction_status='extraction_error',evaluation_flags_json=?,updated_at=datetime('now') WHERE id=?`,
        ).run(JSON.stringify(evaluationFlags), submissionId);
        return res.status(
          error instanceof VisionExtractionError ? error.status : 422,
        ).json({
          error: {
            code: error instanceof VisionExtractionError
              ? error.code
              : "DOCUMENT_PROCESSING_FAILED",
            message: error instanceof VisionExtractionError
              ? error.message
              : "The backend could not extract text from this file.",
          },
        });
      }

      if (!evaluationText) {
        evaluationFlags.push({
          code: "no_text",
          severity: "review",
          message: "No selectable text could be extracted from the document.",
        });
        db.prepare(
          `UPDATE submissions SET extracted_text='',extraction_status='no_text',evaluation_flags_json=?,updated_at=datetime('now') WHERE id=?`,
        ).run(JSON.stringify(evaluationFlags), submissionId);
        return res.status(422).json({
          error: {
            code: "NO_DOCUMENT_TEXT",
            message: "No selectable text could be extracted from the submitted file. Review the original file and grade manually.",
          },
        });
      }

      const segments = splitExtractedAnswers(evaluationText, questionAnswers);
      if (questionAnswers.length === 1 && !segments.has(0))
        segments.set(0, evaluationText);
      if (questionAnswers.length > 1 && segments.size === 0) {
        evaluationFlags.push({
          code: "segmentation_uncertain",
          severity: "review",
          message: "Text was extracted, but question matching may be incomplete. The complete extracted text will be sent to AI for question-wise matching; verify the draft against the original PDF.",
        });
      }

      if (questionAnswers.length && segments.size > 0) {
        const updateAnswer = db.prepare(
          `UPDATE submission_answers SET answer_text=?,updated_at=datetime('now') WHERE submission_id=? AND question_index=?`,
        );
        questionAnswers = questionAnswers.map((answer) => ({
          ...answer,
          answerText: segments.get(answer.questionIndex) || "",
        }));
        for (const answer of questionAnswers)
          updateAnswer.run(answer.answerText, submissionId, answer.questionIndex);
        if (questionAnswers.some((answer) => !answer.answerText.trim()))
          evaluationFlags.push({
            code: "missing_answers",
            severity: "notice",
            message: "One or more assignment questions have no detected answer in the document.",
          });
      }

      const composedAnswer = questionAnswers.some((answer) => answer.answerText.trim())
        ? questionAnswers
            .filter((answer) => answer.answerText.trim())
            .map((answer) => `Question ${answer.questionIndex + 1}:\n${answer.answerText}`)
            .join("\n\n")
        : evaluationText;
      db.prepare(
        `UPDATE submissions SET extracted_text=?,answer_text=?,extraction_status=?,evaluation_flags_json=?,updated_at=datetime('now') WHERE id=?`,
      ).run(evaluationText, composedAnswer.slice(0, 50000), extractionStatus, JSON.stringify(evaluationFlags), submissionId);
    }

    if (!evaluationText && !hasTextAnswer) {
      return res.status(409).json({
        error: {
          code: "NO_EVALUATION_TEXT",
          message:
            "No answer text is available for grading. Submit typed answers or provide a document with selectable text.",
        },
      });
    }

    evaluationFlags = evaluationFlags.filter(
      (flag) => !flag.code?.startsWith("authenticity_"),
    );
    const peers = db
      .prepare(
        `SELECT s.extracted_text AS extractedText,s.answer_text AS answerText,
                u.full_name AS studentName
         FROM submissions s JOIN users u ON u.id=s.student_id
         WHERE s.assignment_id=? AND s.id<>?`,
      )
      .all(row.assignmentId, submissionId);
    const sharedPrompts = [
      row.title,
      row.instructions,
      ...assignmentQuestions.map((question) => question.questionText || question.text || ""),
      ...questionAnswers.map((answer) => answer.questionText),
    ];
    const authenticityFlags = analyzeSubmissionAuthenticity({
      text: evaluationText,
      peers,
      sharedPrompts,
    });
    evaluationFlags.push(...authenticityFlags);
    db.prepare(
      `UPDATE submissions SET evaluation_flags_json=?,updated_at=datetime('now') WHERE id=?`,
    ).run(JSON.stringify(evaluationFlags), submissionId);
    if (authenticityFlags.length) {
      const priorAlert = db
        .prepare(
          `SELECT id FROM audit_logs WHERE action='submission.authenticity_alerted'
           AND entity_type='submission' AND entity_id=? LIMIT 1`,
        )
        .get(String(submissionId));
      if (!priorAlert) {
        notify(
          req.user.id,
          "system",
          "Experimental authenticity review signal",
          `${row.title}: a writing-pattern or submission-similarity signal needs teacher review. This is not proof of AI use or misconduct; check the original work before drawing conclusions.`,
          "submission_authenticity_review",
          submissionId,
        );
        writeAudit(
          db,
          req.user.id,
          "submission.authenticity_alerted",
          "submission",
          submissionId,
          { flags: authenticityFlags.map((flag) => flag.code) },
        );
      }
    }
    const gradingFlags = evaluationFlags.filter(
      (flag) => !flag.code?.startsWith("authenticity_"),
    );

    try {
      const evaluableAnswers = questionAnswers
        .map((answer) => ({
          ...answer,
          flags: gradingFlags,
        }));
      if (!evaluableAnswers.length && evaluationText) {
        evaluableAnswers.push({
          questionIndex: 0,
          questionText: row.instructions || row.title,
          maxMarks: Number(row.totalMarks),
          answerText: evaluationText,
          flags: gradingFlags,
        });
      }
      const suggestion = await generateGradingDraft({
        assignment: {
          title: row.title,
          instructions: row.instructions || "",
          totalMarks: Number(row.totalMarks),
        },
        answers: evaluableAnswers,
        rubric: parsed.data.rubric,
        documentText: row.storedFileName ? evaluationText : "",
      });
      if (
        typeof suggestion.feedback !== "string" ||
        !Number.isFinite(Number(suggestion.score))
      )
        throw new Error("Invalid suggestion");
      suggestion.score = Math.max(
        0,
        Math.min(row.totalMarks, Number(suggestion.score)),
      );
      const reviewFlags = [...evaluationFlags];
      const uncertainQuestions = (suggestion.questions || [])
        .filter((question) => question.needsReview)
        .map((question) => ({
          number: question.questionIndex + 1,
          reason: question.uncertaintyReason,
        }));
      if (uncertainQuestions.length) {
        const questionNumbers = uncertainQuestions
          .map((question) => question.number)
          .join(", ");
        const uncertaintyReasons = uncertainQuestions
          .filter((question) => question.reason)
          .map((question) => `Q${question.number} - ${question.reason}`)
          .join("; ");
        reviewFlags.push({
          code: "question_level_uncertainty",
          severity: "review",
          message: `AI recommends manual review for question${uncertainQuestions.length === 1 ? "" : "s"} ${questionNumbers}${uncertaintyReasons ? `: ${uncertaintyReasons}` : "."}`,
        });
      }
      let confidence = 0.92;
      for (const flag of reviewFlags)
        if (!flag.code.startsWith("authenticity_"))
          confidence -= flag.severity === "review" ? 0.28 : 0.1;
      if (assignmentQuestions.length && !questionAnswers.some((answer) => answer.answerText.trim()))
        confidence -= 0.15;
      confidence = Math.max(0.05, Math.min(0.95, confidence));
      if (confidence < 0.65)
        reviewFlags.push({
          code: "low_confidence",
          severity: "review",
          message:
            "This suggestion has limited or uncertain evidence. Verify it carefully against the original submission.",
        });
      suggestion.confidence = Number(confidence.toFixed(2));
      suggestion.confidenceMethod = "evidence_flags";
      suggestion.flags = reviewFlags;
      const evaluationInsert = db
        .prepare(
          `INSERT INTO ai_evaluations
           (submission_id,teacher_id,provider,model,suggested_score,total_marks,confidence,
            feedback,strengths_json,improvements_json,rationale,flags_json,question_suggestions_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          submissionId,
          req.user.id,
          suggestion.provider,
          suggestion.model,
          suggestion.score,
          row.totalMarks,
          suggestion.confidence,
          suggestion.feedback,
          JSON.stringify(suggestion.strengths || []),
          JSON.stringify(suggestion.improvements || []),
          suggestion.rationale || "",
          JSON.stringify(reviewFlags),
          JSON.stringify(suggestion.questions || []),
        );
      if (authenticityFlags.length)
        db.prepare(
          `UPDATE submissions SET evaluation_flags_json=? WHERE id=?`,
        ).run(JSON.stringify(gradingFlags), submissionId);
      writeAudit(
        db,
        req.user.id,
        "submission.ai_suggestion_generated",
        "submission",
        submissionId,
        {
          provider: suggestion.provider,
          model: suggestion.model,
          evaluationId: evaluationInsert.lastInsertRowid,
        },
      );
      return res.json({
        suggestion,
        evaluationId: evaluationInsert.lastInsertRowid,
        requiresTeacherReview: true,
        saved: true,
      });
    } catch (error) {
      console.error("AI suggestion generation failed:", error?.message || "Unknown error");
      const providerError = error instanceof GradingProviderError;
      return res.status(providerError ? error.status : 502).json({
        error: {
          code: providerError ? error.code : "AI_SUGGESTION_FAILED",
          message: providerError
            ? error.message
            : "Could not generate an AI suggestion. You can still grade the submission manually.",
        },
      });
    }
  },
);
const gradeSchema = z
  .object({
    score: z.number().min(0).max(10000),
    feedback: z.string().trim().max(10000).optional().default(""),
    release: z.boolean().optional().default(false),
  })
  .strict();

router.patch("/:submissionId/grade", requireRole("teacher"), (req, res) => {
  const submissionId = parsePositiveId(req.params.submissionId);
  if (!submissionId)
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Submission ID must be a positive integer.",
      },
    });
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid score and feedback.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  const input = parsed.data;
  const row = db
    .prepare(
      `SELECT s.id,s.assignment_id AS assignmentId,a.total_marks AS totalMarks,a.teacher_id AS teacherId
    FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?`,
    )
    .get(submissionId);
  if (!row || row.teacherId !== req.user.id)
    return res.status(404).json({
      error: {
        code: "SUBMISSION_NOT_FOUND",
        message: "Submission not found in your assignments.",
      },
    });
  if (input.score > row.totalMarks)
    return res.status(400).json({
      error: {
        code: "SCORE_EXCEEDS_TOTAL",
        message: `Score cannot exceed ${row.totalMarks} marks.`,
      },
    });
  const gradingStatus = input.release ? "released" : "draft";
  db.prepare(
    `UPDATE submissions SET score=?,feedback=?,grading_status=?,graded_by=?,graded_at=datetime('now'),updated_at=datetime('now') WHERE id=?`,
  ).run(input.score, input.feedback, gradingStatus, req.user.id, submissionId);
  if (input.release)
    db.prepare(
      `INSERT INTO submission_feedback_history (submission_id,scope,score,max_marks,feedback,released_by) VALUES (?,'overall',?,?,?,?)`,
    ).run(
      submissionId,
      input.score,
      row.totalMarks,
      input.feedback,
      req.user.id,
    );
  writeAudit(
    db,
    req.user.id,
    input.release ? "submission.grade_released" : "submission.grade_saved",
    "submission",
    submissionId,
    { score: input.score },
  );
  if (input.release) {
    const student = db
      .prepare(
        "SELECT s.student_id AS studentId,a.title FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?",
      )
      .get(submissionId);
    if (student)
      notify(
        student.studentId,
        "grade_released",
        "Assessment results released",
        `Your results for ${student.title} are now available.`,
        "submission",
        submissionId,
      );
  }
  const submission = db
    .prepare(
      `SELECT id,score,feedback,grading_status AS gradingStatus,graded_at AS gradedAt FROM submissions WHERE id=?`,
    )
    .get(submissionId);
  return res.json({
    message: input.release
      ? "Grade and feedback released to the student."
      : "Grade saved as a draft; the student cannot see it yet.",
    submission,
  });
});

export default router;
