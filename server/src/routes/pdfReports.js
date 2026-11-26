import { Router } from "express";
import PDFDocument from "pdfkit";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePositiveId } from "../services.js";

const router = Router();
router.use(requireAuth, requireRole("teacher"));

// Export only released grades and only records owned by the signed-in teacher.
router.get("/teacher/results.pdf", (req, res) => {
  const teacherId = req.user.id;
  const assignmentId = req.query.assignmentId
    ? parsePositiveId(req.query.assignmentId)
    : null;
  if (req.query.assignmentId && !assignmentId) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  }
  if (assignmentId) {
    const owned = db
      .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
      .get(assignmentId, teacherId);
    if (!owned)
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Assignment not found in your workspace.",
        },
      });
  }
  const rows = db
    .prepare(
      `SELECT c.name AS className,a.title AS assignmentTitle,a.total_marks AS totalMarks,
      u.full_name AS studentName,u.email AS studentEmail,s.score,s.feedback,s.submitted_at AS submittedAt,s.graded_at AS gradedAt
    FROM submissions s JOIN assignments a ON a.id=s.assignment_id
    JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=s.student_id
    WHERE a.teacher_id=? AND s.grading_status='released' AND s.score IS NOT NULL
      AND (? IS NULL OR a.id=?)
    ORDER BY c.name,a.title,u.full_name`,
    )
    .all(teacherId, assignmentId, assignmentId);
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.className} — ${row.assignmentTitle}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const suffix = assignmentId ? `-assignment-${assignmentId}` : "";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="smartgrade-results${suffix}.pdf"`,
  );
  res.setHeader("Cache-Control", "no-store");
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: {
      Title: "SmartGrade AI Released Results Report",
      Author: "SmartGrade AI",
    },
  });
  doc.pipe(res);
  const green = "#064734";
  const light = "#E0FFC2";
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const date = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  doc.rect(0, 0, doc.page.width, 112).fill(green);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(21)
    .text("SmartGrade AI", 48, 35);
  doc.font("Helvetica").fontSize(11).text("Released Results Report", 48, 64);
  doc.fontSize(8).fillColor("#E0FFC2").text(`Generated ${date}`, 48, 84);
  doc.y = 132;
  doc
    .fillColor(green)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(assignmentId ? "Assignment results" : "Class and assignment results");
  doc
    .moveDown(0.35)
    .fillColor("#444444")
    .font("Helvetica")
    .fontSize(9)
    .text(
      "This report contains released grades only. Privately saved and unreleased grades are excluded. Handle student data confidentially.",
    );
  doc.moveDown(1);
  const releasedCount = rows.length;
  const avgPercent = rows.length
    ? rows.reduce(
        (sum, r) =>
          sum +
          (Number(r.totalMarks)
            ? (Number(r.score) / Number(r.totalMarks)) * 100
            : 0),
        0,
      ) / rows.length
    : null;
  const summaryY = doc.y;
  const boxW = (pageWidth - 16) / 3;
  const summary = [
    ["Released results", String(releasedCount)],
    [
      "Average score",
      avgPercent === null ? "N/A" : `${avgPercent.toFixed(1)}%`,
    ],
    ["Report scope", assignmentId ? "One assignment" : "All assignments"],
  ];
  summary.forEach((item, i) => {
    const x = 48 + i * (boxW + 8);
    doc.roundedRect(x, summaryY, boxW, 48, 5).fill("#F1F6F2");
    doc
      .fillColor("#50645A")
      .font("Helvetica")
      .fontSize(8)
      .text(item[0], x + 10, summaryY + 9, { width: boxW - 20 });
    doc
      .fillColor(green)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(item[1], x + 10, summaryY + 23, { width: boxW - 20 });
  });
  doc.y = summaryY + 66;
  if (!rows.length) {
    doc
      .fillColor("#555555")
      .font("Helvetica")
      .fontSize(11)
      .text("No released results were found for this report scope.");
  }
  for (const [group, items] of grouped) {
    if (doc.y > 680) doc.addPage();
    doc
      .moveDown(0.35)
      .fillColor(green)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(group, 48, doc.y, { width: pageWidth });
    doc.moveDown(0.4);
    const columns = [
      { label: "Student", x: 48, w: 130 },
      { label: "Email", x: 178, w: 145 },
      { label: "Score", x: 323, w: 60 },
      { label: "%", x: 383, w: 35 },
      { label: "Submitted", x: 418, w: 82 },
    ];
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(48, y, pageWidth, 20).fill(light);
      columns.forEach((c) =>
        doc
          .fillColor(green)
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(c.label, c.x + 4, y + 6, { width: c.w - 6, ellipsis: true }),
      );
      doc.y = y + 23;
    };
    drawHeader();
    for (const row of items) {
      const scoreText = `${row.score} / ${row.totalMarks}`;
      const pct = Number(row.totalMarks)
        ? `${((Number(row.score) / Number(row.totalMarks)) * 100).toFixed(1)}%`
        : "—";
      const submitted = row.submittedAt
        ? String(row.submittedAt).slice(0, 10)
        : "—";
      const y = doc.y;
      const heights = columns.map((c) =>
        doc.heightOfString(
          String(
            {
              Student: row.studentName,
              Email: row.studentEmail,
              Score: scoreText,
              "%": pct,
              Submitted: submitted,
            }[c.label] ?? "",
          ),
          { width: c.w - 8, font: "Helvetica", fontSize: 7.5 },
        ),
      );
      const h = Math.max(19, ...heights) + 7;
      if (y + h > 745) {
        doc.addPage();
        doc.y = 48;
        doc
          .fillColor(green)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`${group} (continued)`, 48, doc.y, { width: pageWidth });
        doc.moveDown(0.5);
        drawHeader();
      }
      const yy = doc.y;
      if (items.indexOf(row) % 2 === 1)
        doc.rect(48, yy, pageWidth, h).fill("#FAFCFA");
      columns.forEach((c) => {
        const value =
          {
            Student: row.studentName,
            Email: row.studentEmail,
            Score: scoreText,
            "%": pct,
            Submitted: submitted,
          }[c.label] ?? "";
        doc
          .fillColor("#26352D")
          .font("Helvetica")
          .fontSize(7.5)
          .text(String(value), c.x + 4, yy + 5, {
            width: c.w - 8,
            height: h - 6,
            ellipsis: true,
          });
      });
      doc.y = yy + h;
      if (row.feedback) {
        doc
          .fillColor("#52645A")
          .font("Helvetica-Oblique")
          .fontSize(7.5)
          .text(`Feedback: ${String(row.feedback).slice(0, 400)}`, 52, doc.y, {
            width: pageWidth - 8,
          });
        doc.moveDown(0.3);
      }
    }
    doc.moveDown(0.8);
  }
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#68766D")
      .text(
        `SmartGrade AI · Confidential · Page ${i + 1} of ${range.count}`,
        48,
        doc.page.height - 30,
        { width: pageWidth, align: "center" },
      );
  }
  doc.end();
});

export default router;
