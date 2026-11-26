import { Router } from "express";
import { db } from "../database/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePositiveId } from "../services.js";

const router = Router();
router.use(requireAuth, requireRole("teacher"));

// Analytics are limited to the authenticated teacher's own classes and assignments.

// Phase 13: export only released grades for the authenticated teacher.
function csvCell(value) {
  const text = value == null ? "" : String(value);
  // Prefix formula-like cells to prevent spreadsheet formula injection.
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
router.get("/teacher/export.csv", (req, res) => {
  const teacherId = req.user.id;
  const requestedId = req.query.assignmentId
    ? parsePositiveId(req.query.assignmentId)
    : null;
  if (req.query.assignmentId && !requestedId) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Assignment ID must be a positive integer.",
      },
    });
  }
  if (requestedId) {
    const owned = db
      .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
      .get(requestedId, teacherId);
    if (!owned)
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Assignment not found in your selected class.",
        },
      });
  }
  const rows = db
    .prepare(
      `SELECT c.name AS className,a.title AS assignmentTitle,a.total_marks AS totalMarks,
      u.full_name AS studentName,u.email AS studentEmail,s.score,s.feedback
    FROM submissions s JOIN assignments a ON a.id=s.assignment_id
    JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=s.student_id
    WHERE a.teacher_id=? AND s.grading_status='released' AND s.score IS NOT NULL
      AND (? IS NULL OR a.id=?)
    ORDER BY c.name,a.title,u.full_name`,
    )
    .all(teacherId, requestedId, requestedId);
  const header = [
    "Class",
    "Assignment",
    "Student name",
    "Student email",
    "Score",
    "Total marks",
    "Percentage",
    "Feedback",
  ];
  const lines = [
    header,
    ...rows.map((r) => [
      r.className,
      r.assignmentTitle,
      r.studentName,
      r.studentEmail,
      r.score,
      r.totalMarks,
      Number(r.totalMarks)
        ? Number(((Number(r.score) / Number(r.totalMarks)) * 100).toFixed(2))
        : "",
      r.feedback,
    ]),
  ].map((row) => row.map(csvCell).join(","));
  const csv = "\uFEFF" + lines.join("\r\n");
  const suffix = requestedId ? `-assignment-${requestedId}` : "";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="smartgrade-released-results${suffix}.csv"`,
  );
  res.setHeader("Cache-Control", "no-store");
  return res.send(csv);
});

// Excel-compatible class roster export. Only released marks are included.
router.get("/teacher/submissions.csv", (req, res) => {
  const teacherId = req.user.id;
  const classId = req.query.classId ? parsePositiveId(req.query.classId) : null;
  const assignmentId = req.query.assignmentId
    ? parsePositiveId(req.query.assignmentId)
    : null;
  if ((req.query.classId && !classId) || (req.query.assignmentId && !assignmentId))
    return res.status(400).json({ error: { code: "INVALID_ID", message: "Class and assignment IDs must be positive integers." } });
  if (classId && !db.prepare("SELECT id FROM classes WHERE id=? AND teacher_id=?").get(classId, teacherId))
    return res.status(404).json({ error: { code: "CLASS_NOT_FOUND", message: "Class not found in your workspace." } });
  if (assignmentId && !db.prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=? AND (? IS NULL OR class_id=?)").get(assignmentId, teacherId, classId, classId))
    return res.status(404).json({ error: { code: "ASSIGNMENT_NOT_FOUND", message: "Assignment not found in your selected class." } });
  if (!classId)
    return res.status(400).json({ error: { code: "CLASS_REQUIRED", message: "Select a class before exporting submission records." } });

  const rows = db.prepare(`
    SELECT c.name AS className,a.title AS assignmentTitle,u.full_name AS studentName,u.email AS studentEmail,
      CASE WHEN s.id IS NULL THEN 'Not submitted' ELSE 'Submitted' END AS submissionStatus,
      CASE WHEN s.grading_status='released' THEN s.score ELSE NULL END AS score,
      CASE WHEN s.grading_status='released' THEN a.total_marks ELSE NULL END AS totalMarks,
      CASE WHEN s.grading_status='released' AND a.total_marks>0 THEN ROUND(s.score*100.0/a.total_marks,2) ELSE NULL END AS percentage,
      CASE WHEN s.grading_status='released' THEN s.feedback ELSE '' END AS feedback,
      s.submitted_at AS submittedAt
    FROM class_enrollments ce JOIN users u ON u.id=ce.student_id
    JOIN classes c ON c.id=ce.class_id
    JOIN assignments a ON a.class_id=c.id AND a.teacher_id=c.teacher_id AND a.status!='archived'
    LEFT JOIN submissions s ON s.assignment_id=a.id AND s.student_id=ce.student_id
    WHERE c.teacher_id=? AND c.id=? AND ce.status='active' AND (? IS NULL OR a.id=?)
    ORDER BY a.created_at DESC,u.full_name
  `).all(teacherId, classId, assignmentId, assignmentId);
  const header = ["Class", "Assignment", "Student name", "Student email", "Submission status", "Score", "Total marks", "Percentage", "Feedback", "Submitted at"];
  const csv = "\uFEFF" + [header, ...rows.map((row) => Object.values(row))]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="smartgrade-class-${classId}-submission-records.csv"`);
  res.setHeader("Cache-Control", "no-store");
  return res.send(csv);
});

router.get("/teacher", (req, res) => {
  const teacherId = req.user.id;
  const requestedClassId = req.query.classId
    ? parsePositiveId(req.query.classId)
    : null;
  const requestedId = req.query.assignmentId
    ? parsePositiveId(req.query.assignmentId)
    : null;
  if ((req.query.assignmentId && !requestedId) || (req.query.classId && !requestedClassId)) {
    return res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: "Class and assignment IDs must be positive integers.",
      },
    });
  }
  if (requestedClassId && !db.prepare("SELECT id FROM classes WHERE id=? AND teacher_id=?").get(requestedClassId, teacherId))
    return res.status(404).json({ error: { code: "CLASS_NOT_FOUND", message: "Class not found in your workspace." } });
  if (requestedId) {
    const owned = db
      .prepare("SELECT id FROM assignments WHERE id=? AND teacher_id=?")
      .get(requestedId, teacherId);
    if (!owned)
      return res.status(404).json({
        error: {
          code: "ASSIGNMENT_NOT_FOUND",
          message: "Assignment not found in your workspace.",
        },
      });
  }

  const assignmentRows = db
    .prepare(
      `SELECT a.id,a.title,a.total_marks AS totalMarks,a.status,a.created_at AS createdAt,
      c.id AS classId,c.name AS className,
      (SELECT COUNT(*) FROM class_enrollments ce WHERE ce.class_id=c.id AND ce.status='active') AS enrolledCount,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submissionCount,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.grading_status='released') AS gradedCount,
      (SELECT AVG(s.score) FROM submissions s WHERE s.assignment_id=a.id AND s.grading_status='released') AS averageScore,
      (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.grading_status='released' AND s.score >= a.total_marks*0.8) AS atOrAbove80Pct
    FROM assignments a JOIN classes c ON c.id=a.class_id
      WHERE a.teacher_id=? AND a.status!='archived' AND (? IS NULL OR a.id=?)
        AND (? IS NULL OR a.class_id=?)
    ORDER BY a.created_at DESC`,
    )
    .all(teacherId, requestedId, requestedId, requestedClassId, requestedClassId);

  const totals = db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM classes WHERE teacher_id=? AND status='active') AS activeClasses,
    (SELECT COUNT(*) FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id WHERE c.teacher_id=? AND c.status='active' AND ce.status='active') AS activeEnrollments,
    (SELECT COUNT(*) FROM assignments WHERE teacher_id=? AND status='published') AS publishedAssignments,
    (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.teacher_id=?) AS submissions,
    (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.teacher_id=? AND s.grading_status='released') AS releasedResults,
    (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id=s.assignment_id WHERE a.teacher_id=? AND s.grading_status!='released') AS notReleasedResults`,
    )
    .get(teacherId, teacherId, teacherId, teacherId, teacherId, teacherId);

  const classMarks = [];
  const assignments = assignmentRows.map((a) => {
    const enrolled = Number(a.enrolledCount || 0);
    const submitted = Number(a.submissionCount || 0);
    const graded = Number(a.gradedCount || 0);
    const average =
      a.averageScore == null ? null : Number(Number(a.averageScore).toFixed(2));
    const released = db
      .prepare(
        `SELECT s.score,s.feedback,s.student_id AS studentId,u.full_name AS studentName,
         u.email AS studentEmail,s.graded_at AS gradedAt
      FROM submissions s JOIN users u ON u.id=s.student_id
      WHERE s.assignment_id=? AND s.grading_status='released' AND s.score IS NOT NULL ORDER BY s.score DESC`,
      )
      .all(a.id);
    for (const mark of released)
      classMarks.push({
        classId: a.classId,
        className: a.className,
        assignmentId: a.id,
        assignmentTitle: a.title,
        studentId: mark.studentId,
        studentName: mark.studentName,
        studentEmail: mark.studentEmail,
        score: Number(mark.score),
        totalMarks: Number(a.totalMarks),
        percent: Number(
          ((Number(mark.score) / Number(a.totalMarks)) * 100).toFixed(1),
        ),
        gradedAt: mark.gradedAt,
      });
    const questionStats = db
      .prepare(
        `SELECT sa.question_index AS questionIndex,sa.question_text AS questionText,sa.max_marks AS maxMarks,
        COUNT(*) AS gradedResponses,AVG(sa.score) AS averageScore
      FROM submission_answers sa JOIN submissions s ON s.id=sa.submission_id
      WHERE s.assignment_id=? AND sa.grading_status='released' AND sa.score IS NOT NULL
      GROUP BY sa.question_index,sa.question_text,sa.max_marks ORDER BY sa.question_index`,
      )
      .all(a.id)
      .map((q) => ({
        ...q,
        averageScore:
          q.averageScore == null
            ? null
            : Number(Number(q.averageScore).toFixed(2)),
        averagePercent:
          q.averageScore == null || !q.maxMarks
            ? null
            : Number(
                ((Number(q.averageScore) / Number(q.maxMarks)) * 100).toFixed(
                  1,
                ),
              ),
      }));
    const buckets = [
      { label: "0–49%", min: 0, max: 0.5, count: 0 },
      { label: "50–59%", min: 0.5, max: 0.6, count: 0 },
      { label: "60–69%", min: 0.6, max: 0.7, count: 0 },
      { label: "70–79%", min: 0.7, max: 0.8, count: 0 },
      { label: "80–100%", min: 0.8, max: 1.000001, count: 0 },
    ];
    for (const item of released) {
      const pct = Number(a.totalMarks)
        ? Number(item.score) / Number(a.totalMarks)
        : 0;
      const bucket = buckets.find((b) => pct >= b.min && pct < b.max);
      if (bucket) bucket.count++;
    }
    const completionRate = enrolled
      ? Number(((submitted / enrolled) * 100).toFixed(1))
      : null;
    const gradingRate = submitted
      ? Number(((graded / submitted) * 100).toFixed(1))
      : null;
    return {
      id: a.id,
      title: a.title,
      totalMarks: Number(a.totalMarks),
      status: a.status,
      createdAt: a.createdAt,
      classId: a.classId,
      className: a.className,
      enrolledCount: enrolled,
      submissionCount: submitted,
      gradedCount: graded,
      pendingGradeCount: Math.max(0, submitted - graded),
      averageScore: average,
      averagePercent:
        average == null
          ? null
          : Number(((average / Number(a.totalMarks)) * 100).toFixed(1)),
      completionRate,
      gradingRate,
      atOrAbove80Pct: Number(a.atOrAbove80Pct || 0),
      scoreDistribution: buckets,
      questionStats,
    };
  });

  const published = assignments.filter((a) => a.status === "published");
  const releasedScores = assignments.flatMap((a) =>
    a.averageScore == null
      ? []
      : [{ average: a.averageScore, total: a.totalMarks }],
  );
  const overallAveragePercent = releasedScores.length
    ? Number(
        (
          releasedScores.reduce(
            (sum, x) => sum + (x.average / x.total) * 100,
            0,
          ) / releasedScores.length
        ).toFixed(1),
      )
    : null;
  const knowledgeGaps = assignments.flatMap((assignment) =>
    assignment.questionStats
      .filter(
        (question) =>
          question.averagePercent !== null && question.averagePercent < 70,
      )
      .map((question) => ({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        className: assignment.className,
        questionIndex: question.questionIndex,
        questionText: question.questionText,
        averagePercent: question.averagePercent,
        responses: question.gradedResponses,
      })),
  );
  const reliabilityRows = db
    .prepare(
      `SELECT ae.suggested_score AS suggestedScore,a.total_marks AS totalMarks,
       s.score AS teacherScore
       FROM submissions s
       JOIN assignments a ON a.id=s.assignment_id
       JOIN ai_evaluations ae ON ae.id=(
         SELECT latest.id FROM ai_evaluations latest
         WHERE latest.submission_id=s.id
           AND latest.provider IN ('bluesminds','nvidia','openai')
         ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1
       )
       WHERE a.teacher_id=? AND s.grading_status='released' AND s.score IS NOT NULL
         AND (? IS NULL OR a.id=?)`,
    )
    .all(teacherId, requestedId, requestedId);
  const differences = reliabilityRows
    .filter((row) => Number(row.totalMarks) > 0)
    .map((row) =>
      Math.abs(
        (Number(row.suggestedScore) / Number(row.totalMarks)) * 100 -
          (Number(row.teacherScore) / Number(row.totalMarks)) * 100,
      ),
    );
  const meanAbsoluteDifferencePercent = differences.length
    ? Number(
        (
          differences.reduce((sum, difference) => sum + difference, 0) /
          differences.length
        ).toFixed(1),
      )
    : null;
  const withinFivePercentagePoints = differences.filter(
    (difference) => difference <= 5,
  ).length;
  const analyticsClassId = requestedClassId || assignmentRows[0]?.classId || null;
  let classReport = null;
  if (analyticsClassId) {
    const classInfo = db
      .prepare("SELECT id,name,subject FROM classes WHERE id=? AND teacher_id=?")
      .get(analyticsClassId, teacherId);
    const history = db.prepare(`
      SELECT a.id,a.title,a.status,a.total_marks AS totalMarks,a.created_at AS createdAt,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) AS submissionCount,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id AND s.grading_status='released') AS releasedCount
      FROM assignments a WHERE a.teacher_id=? AND a.class_id=?
      ORDER BY a.created_at DESC,a.id DESC
    `).all(teacherId, analyticsClassId).map((item) => ({
      ...item,
      totalMarks: Number(item.totalMarks),
      submissionCount: Number(item.submissionCount),
      releasedCount: Number(item.releasedCount),
    }));
    const roster = db.prepare(`
      SELECT ce.student_id AS studentId,u.full_name AS studentName,u.email AS studentEmail
      FROM class_enrollments ce JOIN users u ON u.id=ce.student_id
      WHERE ce.class_id=? AND ce.status='active' ORDER BY u.full_name,u.email
    `).all(analyticsClassId);
    const overviewAssignments = assignmentRows.filter((item) =>
      ["published", "closed"].includes(item.status),
    );
    const overviewRows = db.prepare(`
      SELECT s.student_id AS studentId,s.assignment_id AS assignmentId,s.id AS submissionId,
        s.grading_status AS gradingStatus,s.submitted_at AS submittedAt
      FROM submissions s JOIN assignments a ON a.id=s.assignment_id
      WHERE a.teacher_id=? AND a.class_id=? AND a.status!='archived'
        AND (? IS NULL OR a.id=?)
    `).all(teacherId, analyticsClassId, requestedId, requestedId);
    const submissionsByStudent = new Map();
    for (const submission of overviewRows) {
      if (!submissionsByStudent.has(submission.studentId))
        submissionsByStudent.set(submission.studentId, new Map());
      submissionsByStudent.get(submission.studentId).set(submission.assignmentId, submission);
    }
    const submissionOverviewAssignments = overviewAssignments.filter((item) =>
      !requestedId || item.id === requestedId,
    ).map(({ id, title }) => ({ id, title }));
    const submissionOverview = roster.map((student) => {
      const submissions = submissionsByStudent.get(student.studentId) || new Map();
      return {
        ...student,
        assignments: submissionOverviewAssignments.map((item) => {
          const submission = submissions.get(item.id);
          return {
            assignmentId: item.id,
            status: submission ? "submitted" : "not_submitted",
            gradingStatus: submission?.gradingStatus || null,
            submittedAt: submission?.submittedAt || null,
          };
        }),
      };
    });
    const allReleased = db.prepare(`
      SELECT s.student_id AS studentId,u.full_name AS studentName,u.email AS studentEmail,
        s.score,a.total_marks AS totalMarks,a.id AS assignmentId,a.title AS assignmentTitle,
        a.created_at AS assignmentCreatedAt,s.graded_at AS gradedAt
      FROM submissions s JOIN assignments a ON a.id=s.assignment_id
      JOIN users u ON u.id=s.student_id
      WHERE a.teacher_id=? AND a.class_id=? AND s.grading_status='released' AND s.score IS NOT NULL
      ORDER BY a.created_at,a.id,s.graded_at
    `).all(teacherId, analyticsClassId);
    const individualMap = new Map();
    for (const result of allReleased) {
      if (!individualMap.has(result.studentId))
        individualMap.set(result.studentId, {
          studentId: result.studentId,
          studentName: result.studentName,
          studentEmail: result.studentEmail,
          results: [],
        });
      const totalMarks = Number(result.totalMarks);
      const score = Number(result.score);
      individualMap.get(result.studentId).results.push({
        assignmentId: result.assignmentId,
        assignmentTitle: result.assignmentTitle,
        assignmentCreatedAt: result.assignmentCreatedAt,
        score,
        totalMarks,
        percentage: totalMarks ? Number(((score / totalMarks) * 100).toFixed(1)) : null,
        gradedAt: result.gradedAt,
      });
    }
    const individualPerformance = roster.map((student) => {
      const performance = individualMap.get(student.studentId);
      const results = performance?.results || [];
      return {
        ...student,
        results,
        averagePercent: results.length
          ? Number((results.reduce((sum, result) => sum + (result.percentage || 0), 0) / results.length).toFixed(1))
          : null,
      };
    });
    const performanceTrends = db.prepare(`
      SELECT a.id AS assignmentId,a.title AS assignmentTitle,a.created_at AS assignmentCreatedAt,
        COUNT(s.id) AS gradedCount,AVG(s.score*100.0/a.total_marks) AS averagePercent
      FROM assignments a LEFT JOIN submissions s
        ON s.assignment_id=a.id AND s.grading_status='released' AND s.score IS NOT NULL
      WHERE a.teacher_id=? AND a.class_id=?
      GROUP BY a.id ORDER BY a.created_at,a.id
    `).all(teacherId, analyticsClassId).map((point) => ({
      ...point,
      gradedCount: Number(point.gradedCount),
      averagePercent: point.averagePercent == null ? null : Number(Number(point.averagePercent).toFixed(1)),
    }));
    const activeAssignmentIds = history.filter((item) => item.status !== "archived").map((item) => item.id);
    const classSubmissionCount = db.prepare(`
      SELECT COUNT(s.id) AS submitted,
        SUM(CASE WHEN s.id IS NOT NULL AND s.grading_status='released' THEN 1 ELSE 0 END) AS released
      FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id
      WHERE a.teacher_id=? AND a.class_id=? AND a.status!='archived'
        AND (? IS NULL OR a.id=?)
    `).get(teacherId, analyticsClassId, requestedId, requestedId);
    const releasedPercentages = allReleased.map((item) =>
      Number(item.totalMarks) ? (Number(item.score) / Number(item.totalMarks)) * 100 : null,
    ).filter((value) => value !== null);
    classReport = {
      class: classInfo,
      submissionOverview: {
        assignments: submissionOverviewAssignments,
        students: submissionOverview,
      },
      classPerformance: {
        activeStudents: roster.length,
        assignments: requestedId ? 1 : activeAssignmentIds.length,
        submissions: Number(classSubmissionCount.submitted || 0),
        releasedResults: Number(classSubmissionCount.released || 0),
        awaitingReview: Math.max(0, Number(classSubmissionCount.submitted || 0) - Number(classSubmissionCount.released || 0)),
        averageReleasedPercent: releasedPercentages.length
          ? Number((releasedPercentages.reduce((sum, value) => sum + value, 0) / releasedPercentages.length).toFixed(1))
          : null,
      },
      individualPerformance,
      performanceTrends,
      assignmentHistory: history,
    };
  }
  return res.json({
    summary: {
      ...totals,
      activeClasses: Number(totals.activeClasses),
      activeEnrollments: Number(totals.activeEnrollments),
      publishedAssignments: Number(totals.publishedAssignments),
      submissions: Number(totals.submissions),
      releasedResults: Number(totals.releasedResults),
      notReleasedResults: Number(totals.notReleasedResults),
      overallAveragePercent,
    },
    assignments,
    classMarks,
    classReport,
    knowledgeGaps,
    reliability: {
      comparedResults: differences.length,
      meanAbsoluteDifferencePercent,
      withinFivePercentagePoints,
      withinFivePercentRate: differences.length
        ? Number(
            ((withinFivePercentagePoints / differences.length) * 100).toFixed(
              1,
            ),
          )
        : null,
    },
    notes: [
      "Averages and score distributions use released grades only.",
      "Completion rate compares submissions with active enrollments in the class; it can exceed 100% if enrollments changed after submissions were made.",
      "Question analysis includes only released per-question grades.",
      "Knowledge gap signals include questions averaging below 70% across released question grades.",
      "AI agreement compares the latest stored suggestion with the teacher's released score; it is a descriptive comparison, not a model-quality guarantee.",
    ],
  });
});

export default router;
