import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import { db } from "../database/db.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../services.js";

const router = Router();
router.use(requireAuth, requireRole("teacher"));
fs.mkdirSync(env.uploadDirectory, { recursive: true });
const allowed = new Map([
  [".pdf", new Set(["application/pdf"])],
  [
    ".docx",
    new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ]),
  ],
  [".txt", new Set(["text/plain", "application/octet-stream"])],
]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDirectory),
  filename: (_req, file, cb) =>
    cb(
      null,
      `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
    ),
});
const upload = multer({
  storage,
  limits: {
    fileSize: Math.min(env.MAX_UPLOAD_SIZE, 10 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.has(ext) || !allowed.get(ext).has(file.mimetype))
      return cb(new Error("Upload a PDF, DOCX, or TXT file only."));
    cb(null, true);
  },
});

function extractQuestions(text) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();
  if (!normalized) return [];
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const startsQuestion = (line) =>
    /^(?:(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}\s*[.)\-:]\s+|\(?[a-hA-H]\)\s+|(?:Q(?:uestion)?\s*\d{1,2}\b))/i.test(
      line,
    );
  const questions = [];
  let current = "";
  for (const line of lines) {
    if (startsQuestion(line) && current) {
      questions.push(current.trim());
      current = line;
    } else if (startsQuestion(line) && !current) current = line;
    else current = current ? `${current}\n${line}` : line;
  }
  if (current.trim()) questions.push(current.trim());
  return questions
    .slice(0, 200)
    .map((text, index) => ({ id: index + 1, text, marks: null }));
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".txt") return fs.readFileSync(file.path, "utf8");
  if (ext === ".pdf") {
    const parsed = await pdfParse(fs.readFileSync(file.path));
    return parsed.text || "";
  }
  const parsed = await mammoth.extractRawText({ path: file.path });
  return parsed.value || "";
}

const paperUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(180).optional(),
    questions: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            text: z.string().trim().min(1).max(10000),
            marks: z.number().finite().min(0).max(10000).nullable().optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

router.get("/", (req, res) => {
  const papers = db
    .prepare(
      `SELECT id,title,original_name AS originalName,mime_type AS mimeType,file_size AS fileSize,
    question_count AS questionCount,created_at AS createdAt,updated_at AS updatedAt FROM question_papers WHERE teacher_id=? ORDER BY updated_at DESC`,
    )
    .all(req.user.id);
  res.json({ papers });
});

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      if (req.file?.path) fs.rmSync(req.file.path, { force: true });
      const tooLarge =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
          message: tooLarge
            ? "The file exceeds the 10 MB upload limit."
            : err.message || "Upload failed.",
        },
      });
    }
    if (!req.file)
      return res.status(400).json({
        error: {
          code: "FILE_REQUIRED",
          message: "Choose a PDF, DOCX, or TXT file.",
        },
      });
    try {
      const extractedText = (await extractText(req.file))
        .replace(/\0/g, "")
        .slice(0, 500000);
      if (!extractedText.trim()) {
        fs.rmSync(req.file.path, { force: true });
        return res.status(422).json({
          error: {
            code: "NO_TEXT_EXTRACTED",
            message:
              "No selectable text was found. Upload a PDF with selectable text, DOCX, or TXT file.",
          },
        });
      }
      const questions = extractQuestions(extractedText);
      const rawTitle = path
        .basename(req.file.originalname, path.extname(req.file.originalname))
        .slice(0, 180);
      const title = rawTitle.length >= 2 ? rawTitle : "Question paper";
      const result = db
        .prepare(
          `INSERT INTO question_papers (teacher_id,title,original_name,stored_name,mime_type,file_size,extracted_text,questions_json,question_count)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          req.user.id,
          title,
          path.basename(req.file.originalname).slice(0, 255),
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          extractedText,
          JSON.stringify(questions),
          questions.length,
        );
      writeAudit(
        db,
        req.user.id,
        "question_paper.uploaded",
        "question_paper",
        String(result.lastInsertRowid),
        {
          fileType: path.extname(req.file.originalname).toLowerCase(),
          questionCount: questions.length,
        },
      );
      return res.status(201).json({
        paper: {
          id: Number(result.lastInsertRowid),
          title,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          extractedText,
          questions,
          questionCount: questions.length,
        },
        message:
          "Question paper uploaded and text extracted. Review the detected questions before using them.",
      });
    } catch (e) {
      fs.rmSync(req.file.path, { force: true });
      return next(e);
    }
  });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "Question paper ID is invalid." },
    });
  const row = db
    .prepare(
      `SELECT id,title,original_name AS originalName,mime_type AS mimeType,file_size AS fileSize,extracted_text AS extractedText,questions_json AS questionsJson,question_count AS questionCount,created_at AS createdAt,updated_at AS updatedAt FROM question_papers WHERE id=? AND teacher_id=?`,
    )
    .get(id, req.user.id);
  if (!row)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Question paper was not found." },
    });
  res.json({ paper: { ...row, questions: JSON.parse(row.questionsJson) } });
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "Question paper ID is invalid." },
    });
  const parsed = paperUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the question title and question list.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  const existing = db
    .prepare("SELECT id,title FROM question_papers WHERE id=? AND teacher_id=?")
    .get(id, req.user.id);
  if (!existing)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Question paper was not found." },
    });
  const title = parsed.data.title ?? existing.title;
  const questions = parsed.data.questions.map((q, i) => ({
    id: i + 1,
    text: q.text,
    marks: q.marks ?? null,
  }));
  db.prepare(
    `UPDATE question_papers SET title=?,questions_json=?,question_count=?,updated_at=datetime('now') WHERE id=? AND teacher_id=?`,
  ).run(title, JSON.stringify(questions), questions.length, id, req.user.id);
  writeAudit(
    db,
    req.user.id,
    "question_paper.questions_updated",
    "question_paper",
    String(id),
    { questionCount: questions.length },
  );
  res.json({
    paper: { id, title, questions, questionCount: questions.length },
    message: "Question paper changes saved.",
  });
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      "SELECT id,stored_name AS storedName FROM question_papers WHERE id=? AND teacher_id=?",
    )
    .get(id, req.user.id);
  if (!row)
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Question paper was not found." },
    });
  db.prepare("DELETE FROM question_papers WHERE id=? AND teacher_id=?").run(
    id,
    req.user.id,
  );
  fs.rmSync(path.join(env.uploadDirectory, path.basename(row.storedName)), {
    force: true,
  });
  writeAudit(
    db,
    req.user.id,
    "question_paper.deleted",
    "question_paper",
    String(id),
  );
  res.json({ message: "Question paper deleted." });
});

export default router;
