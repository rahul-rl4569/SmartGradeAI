import React from "react";
import Notifications from "./Notifications.jsx";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BookOpen,
  ClipboardList,
  Users,
  Plus,
  LogOut,
  LayoutDashboard,
  FileText,
  Search,
  X,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Eye,
  Save,
  Trash2,
  FileUp,
  BarChart3,
  RefreshCw,
  Download,
  ChevronLeft,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { API_BASE } from "./apiConfig.js";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});
const errText = (e) =>
  e.response?.data?.error?.message ||
  (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT"
    ? "The request took too long. Please try again."
    : "Could not connect to the server. Confirm the backend is running.");

export default function TeacherDashboard({ user, setUser }) {
  const [tab, setTab] = useState("overview");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsClassId, setAnalyticsClassId] = useState("");
  const [analyticsAssignment, setAnalyticsAssignment] = useState("");
  const [releasedResultsOpen, setReleasedResultsOpen] = useState(false);
  const [pendingResultsOpen, setPendingResultsOpen] = useState(false);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [classModal, setClassModal] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingAssignmentClass, setEditingAssignmentClass] = useState("");
  const [assignmentFormError, setAssignmentFormError] = useState("");
  const [classForm, setClassForm] = useState({
    name: "",
    subject: "",
    description: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    classId: "",
    title: "",
    instructions: "",
    totalMarks: 100,
    dueAt: "",
  });
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [assignmentClassFilter, setAssignmentClassFilter] = useState("");
  const [classMenuOpen, setClassMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [classMembers, setClassMembers] = useState([]);
  const [membersBusy, setMembersBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState({});
  const [reviewWorkspaceOpen, setReviewWorkspaceOpen] = useState({});
  const [rubricText, setRubricText] = useState("");
  const [reviewClassId, setReviewClassId] = useState("");
  const [reviewAssignment, setReviewAssignment] = useState("");
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewBatchProgress, setReviewBatchProgress] = useState(null);
  const [releaseBatchProgress, setReleaseBatchProgress] = useState(null);
  const [submissionPreview, setSubmissionPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [gradeForms, setGradeForms] = useState({});
  const [questionGradeForms, setQuestionGradeForms] = useState({});
  const [questionFile, setQuestionFile] = useState(null);
  const [assignmentAttachment, setAssignmentAttachment] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [questionPapers, setQuestionPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [questionDrafts, setQuestionDrafts] = useState([]);
  const [paperTitle, setPaperTitle] = useState("");
  const [paperBusy, setPaperBusy] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderQuestions, setBuilderQuestions] = useState([]);
  const [builderForm, setBuilderForm] = useState({
    classId: "",
    title: "",
    instructions: "",
    dueAt: "",
  });

  async function loadAnalytics(assignmentId = "", classId = "") {
    setAnalyticsBusy(true);
    setError("");
    try {
      const r = await api.get("/analytics/teacher", {
        params: {
          ...(classId ? { classId } : {}),
          ...(assignmentId ? { assignmentId } : {}),
        },
      });
      setAnalytics(r.data);
    } catch (e) {
      setError(errText(e));
    } finally {
      setAnalyticsBusy(false);
    }
  }
  async function exportReleasedResults() {
    setError("");
    setNotice("");
    try {
      const r = await api.get("/analytics/teacher/export.csv", {
        params: analyticsAssignment
          ? { assignmentId: analyticsAssignment }
          : {},
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([r.data], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = analyticsAssignment
        ? `smartgrade-released-results-assignment-${analyticsAssignment}.csv`
        : "smartgrade-released-results.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(
        "Released-results CSV downloaded. Private and unreleased grades are excluded.",
      );
    } catch (e) {
      setError(errText(e));
    }
  }
  async function exportReleasedResultsPdf() {
    setError("");
    setNotice("");
    try {
      const r = await api.get("/reports/teacher/results.pdf", {
        params: analyticsAssignment
          ? { assignmentId: analyticsAssignment }
          : {},
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([r.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = analyticsAssignment
        ? `smartgrade-results-assignment-${analyticsAssignment}.pdf`
        : "smartgrade-results.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice("PDF report downloaded. It contains released grades only.");
    } catch (e) {
      setError(errText(e));
    }
  }
  async function exportClassRecords() {
    if (!analyticsClassId) return;
    setError("");
    setNotice("");
    try {
      const r = await api.get("/analytics/teacher/submissions.csv", {
        params: {
          classId: analyticsClassId,
          ...(analyticsAssignment ? { assignmentId: analyticsAssignment } : {}),
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `smartgrade-class-${analyticsClassId}-submission-records.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Class submission records downloaded. Unreleased marks are excluded.");
    } catch (e) {
      setError(errText(e));
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [c, a] = await Promise.all([
        api.get("/classes"),
        api.get("/assignments"),
      ]);
      setClasses(c.data.classes || []);
      setAssignments(a.data.assignments || []);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const activeClasses = classes.filter((c) => c.status === "active");
  const recentAssignments = assignments
    .filter((a) => {
      // No due date: keep the assignment visible
      if (!a.dueAt) return true;

      const dueTime = new Date(a.dueAt).getTime();
      const hideAfter = dueTime + 2 * 24 * 60 * 60 * 1000;

      // Keep it visible until 48 hours after the due date
      return Date.now() <= hideAfter;
    })
    .slice(0, 5);
  const filteredClasses = classes
    .filter((c) => c.status === "active")
    .filter((c) =>
      `${c.name} ${c.subject}`.toLowerCase().includes(search.toLowerCase()),
    );
  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (a) =>
          (!assignmentClassFilter ||
            String(a.classId) === String(assignmentClassFilter)) &&
          `${a.title} ${a.className || ""} ${a.status}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [assignments, search, assignmentClassFilter],
  );
  async function createClass(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/classes", classForm);
      setClassModal(false);
      setClassForm({ name: "", subject: "", description: "" });
      setNotice("Class created successfully.");
      await load();
      setTab("classes");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function createAssignment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAssignmentFormError("");

    try {
      const payload = {
        ...assignmentForm,
        classId: Number(assignmentForm.classId),
        totalMarks: Number(assignmentForm.totalMarks),
        dueAt: assignmentForm.dueAt
          ? new Date(assignmentForm.dueAt).toISOString()
          : null,
      };

      let savedAssignment;
      if (editingAssignmentId) {
        const editPayload = {
          title: payload.title,
          instructions: payload.instructions,
          totalMarks: payload.totalMarks,
          dueAt: payload.dueAt,
        };
        const response = await api.patch(
          `/assignments/${editingAssignmentId}`,
          editPayload,
        );
        savedAssignment = response.data.assignment;
      } else {
        // First create the assignment using the existing JSON API.
        const response = await api.post("/assignments", payload);
        savedAssignment = response.data.assignment || response.data;
      }

      // Upload the attachment separately, if one was selected.
      if (assignmentAttachment) {
        const formData = new FormData();
        formData.append("attachment", assignmentAttachment);

        await api.post(
          `/assignments/${savedAssignment.id}/attachment`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
            timeout: 60000,
          },
        );
      }

      setAssignmentModal(false);
      setEditingAssignmentId(null);
      setAssignmentFormError("");

      setAssignmentForm({
        classId: "",
        title: "",
        instructions: "",
        totalMarks: 100,
        dueAt: "",
      });

      setAssignmentAttachment(null);
      setQuestionFile(null);
      setExtractedText("");
      setUploadMessage("");
      setQuestionDrafts([]);
      setSelectedPaper(null);

      setNotice(
        editingAssignmentId
          ? "Assignment updated successfully."
          : "Assignment saved as a draft.",
      );
      await load();
      if (!editingAssignmentId) setTab("assignments");
    } catch (e) {
      if (editingAssignmentId) setAssignmentFormError(errText(e));
      else setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  function openAssignmentEditor(assignment) {
    const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
    const localDueAt = dueDate && Number.isFinite(dueDate.getTime())
      ? new Date(dueDate.getTime() - dueDate.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
    setEditingAssignmentId(assignment.id);
    setEditingAssignmentClass(
      `${assignment.className || "Class"}${assignment.classSubject ? ` · ${assignment.classSubject}` : ""}`,
    );
    setAssignmentForm({
      classId: String(assignment.classId),
      title: assignment.title || "",
      instructions: assignment.instructions || "",
      totalMarks: assignment.totalMarks,
      dueAt: localDueAt,
    });
    setAssignmentAttachment(null);
    setAssignmentFormError("");
    setError("");
    setNotice("");
    setAssignmentModal(true);
  }
  function openAssignmentCreator() {
    setEditingAssignmentId(null);
    setEditingAssignmentClass("");
    setAssignmentForm({
      classId: "",
      title: "",
      instructions: "",
      totalMarks: 100,
      dueAt: "",
    });
    setAssignmentAttachment(null);
    setAssignmentFormError("");
    setError("");
    setAssignmentModal(true);
  }
  async function actionAssignment(id, action) {
    if (action === "delete") {
      const confirmed = window.confirm(
        "Are you sure you want to delete this assignment? This action cannot be undone.",
      );

      if (!confirmed) return;
    }

    setError("");
    setNotice("");
    setBusy(true);

    try {
      if (action === "delete") {
        await api.delete(`/assignments/${id}`);
        setNotice("Assignment deleted successfully.");
      } else {
        await api.post(`/assignments/${id}/${action}`);
        setNotice(
          action === "publish"
            ? "Assignment published successfully."
            : "Assignment closed successfully.",
        );
      }

      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function openClassMembers() {
    if (!selectedClass) return;
    setClassMenuOpen(false);
    setMembersOpen(true);
    setMembersBusy(true);
    setClassMembers([]);
    try {
      const response = await api.get(
        `/classes/${selectedClass.id}/enrollments`,
      );
      setClassMembers(response.data.students || []);
    } catch (e) {
      setError(errText(e));
    } finally {
      setMembersBusy(false);
    }
  }
  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(null);
  }
  async function loadReview(assignmentId) {
    if (!assignmentId) {
      setReviewRows([]);
      return;
    }
    setReviewBusy(true);
    setError("");
    try {
      const r = await api.get(`/submissions/assignment/${assignmentId}`);
      const rows = r.data.submissions || [];
      setReviewRows(rows);
      setAiSuggestions((old) => {
        const next = { ...old };
        rows.forEach((row) => {
          if (row.aiSuggestion) next[row.id] = row.aiSuggestion;
          else delete next[row.id];
        });
        return next;
      });
      setGradeForms((old) => {
        const next = { ...old };
        rows.forEach((row) => {
          if (!next[row.id])
            next[row.id] = {
              score: row.score ?? "",
              feedback: row.feedback ?? "",
            };
        });
        return next;
      });
    } catch (e) {
      setError(errText(e));
    } finally {
      setReviewBusy(false);
    }
  }
  async function openSubmissionFile(row) {
    const extension = row.fileName?.split(".").pop()?.toLowerCase();
    if (extension === "doc") {
      setSubmissionPreview({ kind: "unsupported", row });
      return;
    }
    setPreviewBusy(true);
    setError("");
    setSubmissionPreview({ kind: "loading", row });
    try {
      const response = await api.get(`/submissions/${row.id}/preview`, {
        responseType: "blob",
        timeout: 60000,
      });
      if (extension === "docx") {
        setSubmissionPreview({
          kind: "text",
          row,
          text: await response.data.text(),
        });
      } else {
        setSubmissionPreview({
          kind: "pdf",
          row,
          url: window.URL.createObjectURL(response.data),
        });
      }
    } catch (e) {
      setSubmissionPreview(null);
      setError(errText(e));
    } finally {
      setPreviewBusy(false);
    }
  }
  async function downloadSubmissionFile(row) {
    try {
      const response = await api.get(`/submissions/${row.id}/file`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = row.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errText(e));
    }
  }
  useEffect(() => {
    const objectUrl = submissionPreview?.url;
    return () => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [submissionPreview?.url]);
  async function generateAiSuggestionsForAssignment() {
    if (!reviewRows.length || reviewBusy) return;
    const rows = [...reviewRows];
    let completed = 0;
    let failed = 0;
    const failureDetails = [];
    setReviewBusy(true);
    setError("");
    setNotice("");
    setReviewBatchProgress({ current: 0, total: rows.length });
    for (const [index, row] of rows.entries()) {
      setReviewBatchProgress({ current: index + 1, total: rows.length });
      try {
        const response = await api.post(
          `/submissions/${row.id}/ai-suggest`,
          { rubric: rubricText },
          { timeout: 990000 },
        );
        setAiSuggestions((old) => ({ ...old, [row.id]: response.data.suggestion }));
        completed += 1;
      } catch (requestError) {
        failed += 1;
        const message =
          requestError?.response?.data?.error?.message ||
          requestError?.response?.data?.message ||
          requestError?.message ||
          "The server returned an unknown error.";
        failureDetails.push(
          `${row.studentName || row.studentEmail || `Submission ${row.id}`}: ${message}`,
        );
      }
    }
    setReviewBatchProgress(null);
    setReviewBusy(false);
    setNotice(
      completed
        ? `Generated grading suggestions for ${completed} of ${rows.length} students.`
        : "",
    );
    if (failed) {
      const details = failureDetails.slice(0, 2).join(" ");
      const more = failed > 2 ? ` ${failed - 2} more failed.` : "";
      setError(
        `Could not generate suggestions for ${failed} student${failed === 1 ? "" : "s"}. ${details}${more}`,
      );
    }
  }
  async function releaseGradedResultsForAssignment() {
    if (!reviewRows.length || reviewBusy) return;

    const totalMarks = Number(
      assignments.find(
        (assignment) => String(assignment.id) === String(reviewAssignment),
      )?.totalMarks ?? 10000,
    );
    const pendingRows = reviewRows.filter(
      (row) => row.gradingStatus !== "released",
    );
    const eligibleRows = pendingRows.filter((row) => {
      const score = gradeForms[row.id]?.score;
      return (
        score !== undefined &&
        score !== "" &&
        Number.isFinite(Number(score)) &&
        Number(score) >= 0 &&
        Number(score) <= totalMarks
      );
    });
    const skippedCount = pendingRows.length - eligibleRows.length;

    if (!eligibleRows.length) {
      setNotice("");
      setError(
        pendingRows.length
          ? "No results are ready to release. Enter a valid score for at least one student first."
          : "All submitted results for this assignment have already been released.",
      );
      return;
    }

    const confirmation = [
      `Release scores and feedback for ${eligibleRows.length} student${eligibleRows.length === 1 ? "" : "s"}?`,
      "Students will be able to see these results.",
      skippedCount
        ? `${skippedCount} student${skippedCount === 1 ? "" : "s"} without a valid score will be skipped.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!window.confirm(confirmation)) return;

    let releasedCount = 0;
    const failures = [];
    setReviewBusy(true);
    setError("");
    setNotice("");
    setReleaseBatchProgress({ current: 0, total: eligibleRows.length });

    try {
      for (const [index, row] of eligibleRows.entries()) {
        setReleaseBatchProgress({
          current: index + 1,
          total: eligibleRows.length,
        });
        const form = gradeForms[row.id] || {};
        try {
          await api.patch(`/submissions/${row.id}/grade`, {
            score: Number(form.score),
            feedback: form.feedback || "",
            release: true,
          });
          releasedCount += 1;
        } catch (requestError) {
          const message =
            requestError?.response?.data?.error?.message ||
            requestError?.response?.data?.message ||
            requestError?.message ||
            "The server returned an unknown error.";
          failures.push(
            `${row.studentName || row.studentEmail || `Submission ${row.id}`}: ${message}`,
          );
        }
      }

      await loadReview(reviewAssignment);
      if (releasedCount) {
        setNotice(
          `Released results for ${releasedCount} of ${eligibleRows.length} students.${skippedCount ? ` ${skippedCount} without a valid score were skipped.` : ""}`,
        );
      }
      if (failures.length) {
        const details = failures.slice(0, 2).join(" ");
        const more = failures.length > 2 ? ` ${failures.length - 2} more failed.` : "";
        setError(
          `Could not release results for ${failures.length} student${failures.length === 1 ? "" : "s"}. ${details}${more}`,
        );
      }
    } finally {
      setReleaseBatchProgress(null);
      setReviewBusy(false);
    }
  }
  function applyAiSuggestion(row) {
    const suggestion = aiSuggestions[row.id];
    if (!suggestion) return;
    const teacherReadyFeedback = (item, maxLength) => {
      const sections = [item.feedback || ""];
      if (item.strengths?.length)
        sections.push(`What you did well:\n- ${item.strengths.join("\n- ")}`);
      if (item.improvements?.length)
        sections.push(`Next steps:\n- ${item.improvements.join("\n- ")}`);
      if (item.languageNotes?.length)
        sections.push(`Spelling and grammar suggestions:\n- ${item.languageNotes.join("\n- ")}`);
      return sections.filter(Boolean).join("\n\n").slice(0, maxLength);
    };
    setGradeForms((old) => ({
      ...old,
      [row.id]: {
        score: String(suggestion.score),
        feedback: teacherReadyFeedback(suggestion, 10000),
      },
    }));
    if (suggestion.questions?.length) {
      setQuestionGradeForms((old) => {
        const next = { ...old };
        for (const question of suggestion.questions) {
          const key = `${row.id}-${question.questionIndex}`;
          next[key] = {
            ...(next[key] || {}),
            score: String(question.score),
            feedback: teacherReadyFeedback(question, 5000),
          };
        }
        return next;
      });
    }
    setNotice(
      "Suggestion copied into the grading form. Nothing has been saved or released yet.",
    );
  }
  async function saveQuestionGrade(row, answer, release) {
    const key = `${row.id}-${answer.questionIndex}`;
    const form = questionGradeForms[key] || {
      score: answer.score ?? "",
      feedback: answer.feedback ?? "",
    };
    if (form.score === "" || !Number.isFinite(Number(form.score))) {
      setError("Enter a numeric score for this question.");
      return;
    }
    setReviewBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.patch(
        `/submissions/${row.id}/answers/${answer.questionIndex}/grade`,
        { score: Number(form.score), feedback: form.feedback || "", release },
      );
      setNotice(r.data.message);
      await loadReview(reviewAssignment);
    } catch (e) {
      setError(errText(e));
    } finally {
      setReviewBusy(false);
    }
  }
  async function saveGrade(row, release) {
    const form = gradeForms[row.id] || {};
    if (form.score === "" || !Number.isFinite(Number(form.score))) {
      setError("Enter a numeric score before saving.");
      return;
    }
    setReviewBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api.patch(`/submissions/${row.id}/grade`, {
        score: Number(form.score),
        feedback: form.feedback || "",
        release,
      });
      setNotice(r.data.message);
      await loadReview(reviewAssignment);
    } catch (e) {
      setError(errText(e));
    } finally {
      setReviewBusy(false);
    }
  }
  async function loadQuestionPapers() {
    try {
      const r = await api.get("/question-papers");
      setQuestionPapers(r.data.papers || []);
    } catch (e) {
      setError(errText(e));
    }
  }
  async function readQuestionPaper(file) {
    setQuestionFile(file);
    setUploadMessage("");
    setExtractedText("");
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext)) {
      setUploadMessage("Choose a PDF, DOCX, or TXT file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadMessage("The maximum upload size is 10 MB.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setPaperBusy(true);
    try {
      const r = await api.post("/question-papers", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      const paper = r.data.paper;
      setSelectedPaper(paper);
      setPaperTitle(paper.title);
      setExtractedText(paper.extractedText || "");
      setQuestionDrafts(paper.questions || []);
      setUploadMessage(
        `${r.data.message} ${paper.questionCount} question(s) detected.`,
      );
      await loadQuestionPapers();
    } catch (e) {
      setUploadMessage(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  async function openQuestionPaper(id) {
    setPaperBusy(true);
    setError("");
    try {
      const r = await api.get(`/question-papers/${id}`);
      const p = r.data.paper;
      setSelectedPaper(p);
      setPaperTitle(p.title);
      setExtractedText(p.extractedText || "");
      setQuestionDrafts(p.questions || []);
      setQuestionFile(null);
      setUploadMessage(
        "Saved question paper opened. Review and save any edits.",
      );
    } catch (e) {
      setError(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  async function saveQuestionPaper() {
    if (!selectedPaper) return;
    setPaperBusy(true);
    setError("");
    try {
      const r = await api.put(`/question-papers/${selectedPaper.id}`, {
        title: paperTitle,
        questions: questionDrafts,
      });
      setSelectedPaper((p) => ({ ...p, ...r.data.paper }));
      setQuestionDrafts(r.data.paper.questions || []);
      setNotice(r.data.message);
      await loadQuestionPapers();
    } catch (e) {
      setError(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  async function startAssessmentBuilder(paperId) {
    setPaperBusy(true);
    setError("");
    try {
      const r = await api.get(`/question-papers/${paperId}`);
      const paper = r.data.paper;
      setSelectedPaper(paper);
      setPaperTitle(paper.title);
      setExtractedText(paper.extractedText || "");
      setQuestionDrafts(paper.questions || []);
      const usable = (paper.questions || []).map((q, i) => ({
        text: q.text,
        marks: Number(q.marks) > 0 ? Number(q.marks) : 1,
        included: true,
        sourceIndex: i,
      }));
      if (!usable.length) {
        setError(
          "This paper has no questions yet. Open and edit it to add questions before building an assessment.",
        );
        return;
      }
      setBuilderQuestions(usable);
      setBuilderForm({
        classId: "",
        title: paper.title,
        instructions: "",
        dueAt: "",
      });
      setBuilderOpen(true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  async function createAssessmentFromPaper(e) {
    e.preventDefault();
    const selected = builderQuestions.filter((q) => q.included);
    if (!selected.length) {
      setError("Select at least one question.");
      return;
    }
    if (
      selected.some(
        (q) => !Number.isFinite(Number(q.marks)) || Number(q.marks) <= 0,
      )
    ) {
      setError("Each selected question needs a positive mark value.");
      return;
    }
    const totalMarks = selected.reduce((sum, q) => sum + Number(q.marks), 0);
    setPaperBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        classId: Number(builderForm.classId),
        title: builderForm.title.trim(),
        instructions: builderForm.instructions,
        totalMarks,
        dueAt: builderForm.dueAt
          ? new Date(builderForm.dueAt).toISOString()
          : null,
        questions: selected.map((q) => ({
          text: q.text,
          marks: Number(q.marks),
        })),
      };
      await api.post("/assignments", payload);
      setBuilderOpen(false);
      setNotice(
        `Assessment draft created with ${selected.length} question(s), worth ${totalMarks} marks in total.`,
      );
      await load();
      setTab("assignments");
    } catch (e) {
      setError(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  async function deleteQuestionPaper(id) {
    if (
      !window.confirm("Delete this saved question paper and its uploaded file?")
    )
      return;
    setPaperBusy(true);
    try {
      await api.delete(`/question-papers/${id}`);
      setQuestionPapers((rows) => rows.filter((p) => p.id !== id));
      if (selectedPaper?.id === id) {
        setSelectedPaper(null);
        setQuestionDrafts([]);
        setExtractedText("");
        setPaperTitle("");
      }
      setNotice("Question paper deleted.");
    } catch (e) {
      setError(errText(e));
    } finally {
      setPaperBusy(false);
    }
  }
  function addQuestion() {
    setQuestionDrafts((rows) => [
      ...rows,
      { id: rows.length + 1, text: "", marks: null },
    ]);
  }
  function updateQuestion(index, key, value) {
    setQuestionDrafts((rows) =>
      rows.map((q, i) =>
        i === index
          ? {
              ...q,
              [key]:
                key === "marks" ? (value === "" ? null : Number(value)) : value,
            }
          : q,
      ),
    );
  }
  useEffect(() => {
    if (tab === "questions") loadQuestionPapers();
    if (tab === "analytics") loadAnalytics(analyticsAssignment, analyticsClassId);
  }, [tab]);
  useEffect(() => {
    if (!uploadMessage.startsWith("Saved question paper opened.")) return;
    const timer = window.setTimeout(() => setUploadMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [uploadMessage]);
  const selectedClass = classes.find(
    (classItem) => String(classItem.id) === String(selectedClassId),
  );
  const assignmentFilterClass = classes.find(
    (classItem) => String(classItem.id) === String(assignmentClassFilter),
  );
  const selectedClassAssignments = selectedClass
    ? assignments.filter(
        (item) => String(item.classId) === String(selectedClass.id),
      )
    : [];

  return (
    <div className="teacher-app">
      <aside className="teacher-sidebar">
        <div className="teacher-side-brand">
          <img
            src="/smartgrade-logo.png"
            alt="SmartGrade AI Logo"
            className="side-logo-image"
            style={{
              width: "42px",
              height: "42px",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />{" "}
          <span>
            SmartGrade <b>AI</b>
            <small>TEACHER WORKSPACE</small>
          </span>
        </div>
        <div className="side-section-label">WORKSPACE</div>
        {[
          ["overview", "Overview", LayoutDashboard],
          ["classes", "My Classes", BookOpen],
          ["assignments", "Assignments", ClipboardList],
          ["review", "Review submissions", GraduationCap],
          ["questions", "Question Papers", FileText],
          ["analytics", "Analytics", BarChart3],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className={`side-nav-item ${tab === id ? "selected" : ""}`}
            onClick={() => {
              setTab(id);
              if (id === "classes") setSelectedClassId(null);
              if (id === "assignments") setAssignmentClassFilter("");
              setError("");
            }}
          >
            <Icon size={18} />
            {label}
            {id === "classes" && (
              <span className="side-count">{activeClasses.length}</span>
            )}
          </button>
        ))}
        <div className="teacher-side-bottom">
          <div className="side-user">
            <div className="user-avatar">
              {user.fullName?.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{user.fullName}</strong>
              <small>Teacher</small>
              <small>{user.email}</small>
            </div>
          </div>
          <button className="side-nav-item logout-nav" onClick={logout}>
            <LogOut size={17} /> Log out
          </button>
        </div>
      </aside>
      <main className="teacher-main">
        <header className="teacher-topbar">
          <div>
            <span className="section-kicker">SMARTGRADE AI / TEACHER</span>
            <h1>
              {
                {
                  overview: "Overview",
                  classes: "My Classes",
                  assignments: "Assignments",
                  review: "Review submissions",
                  questions: "Question Papers",
                  analytics: "Analytics",
                }[tab]
              }
            </h1>
          </div>
          <div className="teacher-top-actions">
            <Notifications />
            <span className="teacher-status">
              <i /> Workspace active
            </span>
            <button
              className="button"
              onClick={() => {
                setClassModal(true);
                setError("");
              }}
            >
              <Plus size={16} /> New class
            </button>
          </div>
        </header>
        <div className="teacher-content">
          {error && (
            <div className="dash-alert error">
              <AlertCircle size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="dash-alert success">
              <CheckCircle2 size={18} />
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "overview" && (
            <>
              <section className="teacher-greeting">
                <div>
                  <span className="section-kicker">
                    YOUR CLASSROOM AT A GLANCE
                  </span>
                  <h2>Welcome back, {user.fullName?.split(" ")[0]}.</h2>
                  <p>
                    Manage classes and prepare assignments from one workspace.
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={openAssignmentCreator}
                  disabled={!activeClasses.length}
                >
                  <Plus size={16} /> Create assignment
                </button>
              </section>
              <div className="teacher-metrics">
                <Metric
                  icon={BookOpen}
                  label="Active classes"
                  value={activeClasses.length}
                  onClick={() => setTab("classes")}
                />
                <Metric
                  icon={ClipboardList}
                  label="Assignments"
                  value={assignments.length}
                  onClick={() => setTab("assignments")}
                />
                <Metric
                  icon={Users}
                  label="Students enrolled"
                  value={classes.reduce((n, c) => n + (c.studentCount || 0), 0)}
                  onClick={() => setTab("classes")}
                />
                <Metric
                  icon={FileText}
                  label="Draft assignments"
                  value={assignments.filter((a) => a.status === "draft").length}
                  onClick={() => setTab("assignments")}
                />
              </div>
              <div className="teacher-section-heading">
                <div>
                  <h2>Recent assignments</h2>
                  <p>Latest assignment activity from your workspace.</p>
                </div>
                <button
                  className="text-action"
                  onClick={() => setTab("assignments")}
                >
                  View all →
                </button>
              </div>
              <AssignmentTable
                rows={recentAssignments}
                onAction={actionAssignment}
                onEdit={openAssignmentEditor}
              />{" "}
              <div className="teacher-section-heading">
                <div>
                  <h2>Your classes</h2>
                  <p>Share enrollment codes with students to let them join.</p>
                </div>
                <button
                  className="text-action"
                  onClick={() => setTab("classes")}
                >
                  View all →
                </button>
              </div>
              <ClassGrid
                rows={activeClasses.slice(0, 3)}
                onSelect={(classItem) => {
                  setSelectedClassId(classItem.id);
                  setTab("classes");
                }}
              />
            </>
          )}
          {tab === "classes" && (
            <>
              {!selectedClass && (
                <>
                  <div className="workspace-toolbar">
                    <div>
                      <h2>Manage classes</h2>
                      <p>
                        Create classes and share enrollment codes with students.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => setClassModal(true)}
                    >
                      <Plus size={16} /> New class
                    </button>
                  </div>
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Search classes or subjects"
                  />
                </>
              )}
              {busy ? (
                <Loading />
              ) : selectedClass ? (
                <section className="class-detail-page">
                  <div className="class-detail-topline">
                    <button
                      type="button"
                      className="class-detail-back"
                      onClick={() => {
                        setSelectedClassId(null);
                        setClassMenuOpen(false);
                      }}
                    >
                      <ChevronLeft size={15} /> Back to My classes
                    </button>
                    <div className="class-more-wrap">
                      <button
                        type="button"
                        className="class-more-button"
                        aria-label="Class options"
                        aria-expanded={classMenuOpen}
                        onClick={() => setClassMenuOpen((open) => !open)}
                      >
                        <MoreVertical size={19} />
                      </button>
                      {classMenuOpen && (
                        <div className="class-more-menu">
                          <button type="button" onClick={openClassMembers}>
                            View members
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <h2>{selectedClass.name}</h2>
                  <p className="class-detail-subtitle">
                    {[selectedClass.subject, `Teacher: ${user.fullName}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {selectedClass.description && (
                    <p className="class-detail-description">
                      {selectedClass.description}
                    </p>
                  )}

                  <div className="class-assignment-heading">
                    <div>
                      <h3>Class assignments</h3>
                      <p>All assignments created for this class.</p>
                    </div>
                    <span className="class-assignment-count">
                      {selectedClassAssignments.length}{" "}
                      {selectedClassAssignments.length === 1
                        ? "Assignment"
                        : "Assignments"}
                    </span>
                  </div>

                  <div className="class-assignment-list">
                    {selectedClassAssignments.map((item) => (
                      <article className="class-assignment-row" key={item.id}>
                        <span className="class-assignment-icon">
                          <ClipboardList size={19} />
                        </span>
                        <div className="class-assignment-info">
                          <strong>{item.title}</strong>
                          <small>
                            {selectedClass.name} · {selectedClass.subject} ·{" "}
                            {item.totalMarks} marks
                            {item.dueAt
                              ? ` · Due ${new Date(item.dueAt).toLocaleString()}`
                              : ""}
                          </small>
                        </div>
                        <span className={`status-pill ${item.status}`}>
                          {item.status}
                        </span>
                        <button
                          type="button"
                          className="button class-assignment-open"
                          onClick={() => {
                            setAssignmentClassFilter(selectedClass.id);
                            setSearch("");
                            setTab("assignments");
                          }}
                        >
                          View / edit
                        </button>
                      </article>
                    ))}
                    {!selectedClassAssignments.length && (
                      <div className="empty-workspace">
                        <ClipboardList size={24} />
                        <strong>No assignments yet</strong>
                        <span>
                          Assignments for this class will appear here.
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <ClassGrid
                  rows={filteredClasses}
                  onSelect={(classItem) => setSelectedClassId(classItem.id)}
                />
              )}
            </>
          )}
          {tab === "assignments" && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>
                    {assignmentFilterClass
                      ? `${assignmentFilterClass.name} assignments`
                      : "Assignments"}
                  </h2>
                  <p>
                    {assignmentClassFilter
                      ? `Assignments for ${assignmentFilterClass?.name || "this class"}.`
                      : "Create work, publish it to enrolled students, or close submissions."}
                  </p>
                </div>
                {assignmentClassFilter && (
                  <button
                    type="button"
                    className="mini-action"
                    onClick={() => setAssignmentClassFilter("")}
                  >
                    Show all assignments
                  </button>
                )}
                <button
                  className="button"
                  onClick={openAssignmentCreator}
                  disabled={!activeClasses.length}
                >
                  <Plus size={16} /> New assignment
                </button>
              </div>
              <label className="assignment-chooser">
                <span>Choose a class</span>
                <select
                  value={assignmentClassFilter}
                  onChange={(event) => {
                    setAssignmentClassFilter(event.target.value);
                    setSearch("");
                  }}
                >
                  <option value="">All classes</option>
                  {activeClasses.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name} · {classItem.subject}
                    </option>
                  ))}
                </select>
              </label>
              {busy ? (
                <Loading />
              ) : (
                <AssignmentTable
                  rows={filteredAssignments}
                  onAction={actionAssignment}
                  onEdit={openAssignmentEditor}
                />
              )}
            </>
          )}
          {tab === "review" && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>Review student submissions</h2>
                  <p>
                    Review answers, enter a score and feedback, then release
                    results when you are ready.
                  </p>
                </div>
              </div>
              <div className="form-field review-assignment-picker">
                <label htmlFor="review-class">Select class</label>
                <select
                  id="review-class"
                  value={reviewClassId}
                  onChange={(e) => {
                    setReviewClassId(e.target.value);
                    setReviewAssignment("");
                    setReviewRows([]);
                  }}
                >
                  <option value="">Select a class</option>
                  {activeClasses.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name} — {classItem.subject}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field review-assignment-picker">
                <label htmlFor="review-assignment">Choose an assignment</label>
                <select
                  id="review-assignment"
                  value={reviewAssignment}
                  disabled={!reviewClassId}
                  onChange={(e) => {
                    setReviewAssignment(e.target.value);
                    if (e.target.value) loadReview(e.target.value);
                    else setReviewRows([]);
                  }}
                >
                  <option value="">
                    {reviewClassId
                      ? "Select an assignment"
                      : "Choose a class first"}
                  </option>
                  {assignments
                    .filter((a) => String(a.classId) === String(reviewClassId))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} — {a.className}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field ai-rubric-field">
                <label htmlFor="grading-rubric">
                  Optional grading rubric / criteria
                </label>
                <textarea
                  id="grading-rubric"
                  rows="2"
                  maxLength="5000"
                  value={rubricText}
                  onChange={(e) => setRubricText(e.target.value)}
                  placeholder="Paste criteria, expected points, or a marking scheme…"
                />
                <small>
                  Suggestions are drafts only. Verify facts and marks before
                  saving or releasing.
                </small>
              </div>
              {reviewAssignment && !reviewBusy && (
                <div className="review-assignment-actions">
                  {reviewRows.some((row) => row.fileName) ? (
                    <a
                      className="button"
                      href={`${api.defaults.baseURL.replace(/\/+$/, "")}/submissions/assignment/${encodeURIComponent(reviewAssignment)}/files.zip`}
                    >
                      <Download size={16} /> Download all uploaded files (.zip)
                    </a>
                  ) : (
                    <small>No uploaded files are available for this assignment.</small>
                  )}
                </div>
              )}
              {reviewAssignment && reviewRows.length > 0 && (
                <div className="review-batch-actions">
                  <button
                    className="button"
                    disabled={reviewBusy}
                    onClick={generateAiSuggestionsForAssignment}
                  >
                    <GraduationCap size={16} />
                    {reviewBatchProgress
                      ? `Generating suggestions (${reviewBatchProgress.current}/${reviewBatchProgress.total})`
                      : "Generate grading suggestions for all students"}
                  </button>
                  <button
                    className="button review-release-all"
                    disabled={reviewBusy}
                    onClick={releaseGradedResultsForAssignment}
                  >
                    <Eye size={16} />
                    {releaseBatchProgress
                      ? `Releasing results (${releaseBatchProgress.current}/${releaseBatchProgress.total})`
                      : "Release all graded results"}
                  </button>
                </div>
              )}
              {reviewBusy && !reviewBatchProgress && !releaseBatchProgress ? (
                <Loading />
              ) : !reviewAssignment ? (
                <div className="empty-workspace">
                  <GraduationCap size={24} />
                  <strong>
                    {reviewClassId ? "Select an assignment" : "Select a class"}
                  </strong>
                  <span>
                    Submissions for your selected assignment will appear here.
                  </span>
                </div>
              ) : !reviewRows.length ? (
                <div className="empty-workspace">
                  <ClipboardList size={24} />
                  <strong>No submissions yet</strong>
                  <span>Students' submitted answers will appear here.</span>
                </div>
              ) : (
                <div className="review-list">
                  {reviewRows.map((row) => {
                    const processedFileText = Boolean(
                      row.fileName &&
                        row.extractionStatus === "extracted",
                    );
                    const gradingWorkspaceOpen = Boolean(
                      reviewWorkspaceOpen[row.id],
                    );
                    const reviewTotalMarks =
                      assignments.find(
                        (assignment) =>
                          String(assignment.id) === String(reviewAssignment),
                      )?.totalMarks ?? 10000;
                    return (
                    <article className={`review-card${gradingWorkspaceOpen ? " review-card-expanded" : ""}`} key={row.id}>
                      <div className="submission-compact-bar">
                        <div
                          className="submission-student submission-student-trigger"
                          role="button"
                          tabIndex={0}
                          aria-expanded={gradingWorkspaceOpen}
                          onClick={() =>
                            setReviewWorkspaceOpen((old) => ({
                              ...old,
                              [row.id]: !old[row.id],
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setReviewWorkspaceOpen((old) => ({
                                ...old,
                                [row.id]: !old[row.id],
                              }));
                            }
                          }}
                        >
                          <h3>{row.studentName}</h3>
                          <span>{row.studentEmail}</span>
                        </div>
                        <div className="submission-document">
                          {row.fileName ? (
                            <>
                              <span className="submission-file-name" title={row.fileName}>
                                <FileText size={16} />
                                {row.fileName}
                              </span>
                              <button
                                type="button"
                                className="button button-secondary submission-file-open"
                                disabled={previewBusy}
                                onClick={() => openSubmissionFile(row)}
                              >
                                <Eye size={14} /> Open
                              </button>
                            </>
                          ) : (
                            <span className="submission-file-name">Typed response</span>
                          )}
                        </div>
                        <div className="form-field compact-grade-field">
                          <label htmlFor={`score-${row.id}`}>
                            Score / {reviewTotalMarks}
                          </label>
                          <input
                            id={`score-${row.id}`}
                            type="number"
                            min="0"
                            max={reviewTotalMarks}
                            step="0.5"
                            value={gradeForms[row.id]?.score ?? ""}
                            onChange={(event) =>
                              setGradeForms((old) => ({
                                ...old,
                                [row.id]: {
                                  ...old[row.id],
                                  score: event.target.value,
                                },
                              }))
                            }
                            placeholder="Enter score"
                          />
                        </div>
                        <div className="form-field compact-grade-field compact-feedback-field">
                          <label htmlFor={`feedback-${row.id}`}>
                            Feedback for student
                          </label>
                          <textarea
                            id={`feedback-${row.id}`}
                            rows="1"
                            maxLength="10000"
                            value={gradeForms[row.id]?.feedback ?? ""}
                            onChange={(event) =>
                              setGradeForms((old) => ({
                                ...old,
                                [row.id]: {
                                  ...old[row.id],
                                  feedback: event.target.value,
                                },
                              }))
                            }
                            placeholder="Write feedback"
                          />
                        </div>
                      </div>
                      {gradingWorkspaceOpen && (
                        <div className="review-workspace-details">
                          <div className="review-card-heading">
                            <p>
                              Submitted{" "}
                              {row.submittedAt
                                ? new Date(row.submittedAt + "Z").toLocaleString()
                                : "?"}
                            </p>
                            <span
                              className={`status-pill ${row.gradingStatus === "released" ? "published" : row.gradingStatus === "draft" ? "draft" : "active"}`}
                            >
                              {row.gradingStatus || "ungraded"}
                            </span>
                          </div>
                          <div className="review-answer">
                            <strong>Student answer</strong>
                            <p>
                              {processedFileText
                                ? "Uploaded document processed on the server. Review the original file below."
                                : row.answerText}
                            </p>
                          </div>
                          {row.evaluationFlags?.length > 0 && (
                            <div className="evaluation-review-flags">
                              {row.evaluationFlags.map((flag) => (
                                <p key={flag.code}>
                                  <AlertCircle size={15} /> {flag.message}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {gradingWorkspaceOpen && row.answers?.length > 0 && (
                        <section className="per-question-review">
                          <h4>Per-question answers and grading</h4>
                          {row.answers.map((ans) => {
                            const key = `${row.id}-${ans.questionIndex}`;
                            const form = questionGradeForms[key] || {
                              score: ans.score ?? "",
                              feedback: ans.feedback ?? "",
                            };
                            return (
                              <article
                                className="student-question-item"
                                key={key}
                              >
                                <div>
                                  <strong>
                                    Question {ans.questionIndex + 1}
                                  </strong>
                                  <span>{ans.maxMarks} marks</span>
                                </div>
                                <p>{ans.questionText}</p>
                                <div className="review-answer">
                                  <strong>Student response</strong>
                                  <p>
                                    {processedFileText
                                      ? "Response processed on the server; review the original file above."
                                      : ans.answerText || "No answer provided."}
                                  </p>
                                </div>
                                <div className="review-grade-fields">
                                  <div className="form-field">
                                    <label htmlFor={`qscore-${key}`}>
                                      Score / {ans.maxMarks}
                                    </label>
                                    <input
                                      id={`qscore-${key}`}
                                      type="number"
                                      min="0"
                                      max={ans.maxMarks}
                                      step="0.5"
                                      value={form.score}
                                      onChange={(e) =>
                                        setQuestionGradeForms((old) => ({
                                          ...old,
                                          [key]: {
                                            ...form,
                                            score: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="form-field">
                                    <label htmlFor={`qfeedback-${key}`}>
                                      Question feedback
                                    </label>
                                    <textarea
                                      id={`qfeedback-${key}`}
                                      rows="2"
                                      maxLength="5000"
                                      value={form.feedback}
                                      onChange={(e) =>
                                        setQuestionGradeForms((old) => ({
                                          ...old,
                                          [key]: {
                                            ...form,
                                            feedback: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                                <div className="review-card-actions">
                                  <button
                                    className="button button-secondary"
                                    disabled={reviewBusy}
                                    onClick={() =>
                                      saveQuestionGrade(row, ans, false)
                                    }
                                  >
                                    Save question privately
                                  </button>
                                  <button
                                    className="button"
                                    disabled={reviewBusy}
                                    onClick={() =>
                                      saveQuestionGrade(row, ans, true)
                                    }
                                  >
                                    Release question result
                                  </button>
                                  <span
                                    className={`status-pill ${ans.gradingStatus === "released" ? "published" : "draft"}`}
                                  >
                                    {ans.gradingStatus || "ungraded"}
                                  </span>
                                </div>
                              </article>
                            );
                          })}
                        </section>
                      )}
                      {gradingWorkspaceOpen && aiSuggestions[row.id] && (
                        <div className="ai-suggestion-panel">
                          <strong>
                            Draft suggestion ·{" "}
                            AI-assisted · {aiSuggestions[row.id].model}
                          </strong>
                          <p>
                            <b>Suggested score:</b>{" "}
                            {aiSuggestions[row.id].score} /{" "}
                            {assignments.find(
                              (a) => String(a.id) === String(reviewAssignment),
                            )?.totalMarks ?? "—"}
                          </p>
                          <p>
                            <b>Evidence signal:</b>{" "}
                            {Math.round(
                              Number(aiSuggestions[row.id].confidence || 0) *
                                100,
                            )}
                            %
                            <small>
                              {" "}
                              · Heuristic review indicator, not calibrated
                              confidence
                            </small>
                          </p>
                          {aiSuggestions[row.id].flags?.length > 0 && (
                            <ul className="ai-evaluation-flags">
                              {aiSuggestions[row.id].flags.map((flag) => (
                                <li key={flag.code}>{flag.message}</li>
                              ))}
                            </ul>
                          )}
                          <p>{aiSuggestions[row.id].feedback}</p>
                          {aiSuggestions[row.id].strengths?.length > 0 && (
                            <>
                              <b>Possible strengths</b>
                              <ul>
                                {aiSuggestions[row.id].strengths.map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          {aiSuggestions[row.id].improvements?.length > 0 && (
                            <>
                              <b>Possible improvements</b>
                              <ul>
                                {aiSuggestions[row.id].improvements.map(
                                  (x, i) => (
                                    <li key={i}>{x}</li>
                                  ),
                                )}
                              </ul>
                            </>
                          )}
                          {aiSuggestions[row.id].rationale && (
                            <small>{aiSuggestions[row.id].rationale}</small>
                          )}
                          {aiSuggestions[row.id].questions?.length > 0 && (
                            <section className="ai-question-drafts">
                              <b>Question-wise draft marks</b>
                              <ul>
                                {aiSuggestions[row.id].questions.map((item) => (
                                  <li key={item.questionIndex}>
                                    <span>
                                      Question {item.questionIndex + 1}: {item.score} marks — {item.feedback}
                                    </span>
                                    {item.strengths?.length > 0 && (
                                      <small>
                                        Strengths: {item.strengths.join("; ")}
                                      </small>
                                    )}
                                    {item.improvements?.length > 0 && (
                                      <small>
                                        Next steps: {item.improvements.join("; ")}
                                      </small>
                                    )}
                                    {item.languageNotes?.length > 0 && (
                                      <small>
                                        Language suggestions: {item.languageNotes.join("; ")}
                                      </small>
                                    )}
                                    {item.needsReview && (
                                      <small className="question-review-warning">
                                        Teacher review recommended
                                        {item.uncertaintyReason
                                          ? `: ${item.uncertaintyReason}`
                                          : "."}
                                      </small>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          )}
                          <p className="ai-review-warning">
                            Not a final grade. Check against your rubric and the
                            student’s answer. The suggestion is saved for
                            comparison, but it does not save or release a grade.
                          </p>
                        </div>
                      )}
                      {gradingWorkspaceOpen && aiSuggestions[row.id] && (
                        <div className="ai-suggestion-actions">
                          <button
                            className="button button-secondary"
                            disabled={reviewBusy}
                            onClick={() => applyAiSuggestion(row)}
                          >
                            Use suggestion in form
                          </button>
                        </div>
                      )}
                      <div className="review-card-actions">
                        <button
                          className="button button-secondary"
                          disabled={reviewBusy}
                          onClick={() => saveGrade(row, false)}
                        >
                          Save privately
                        </button>
                        <button
                          className="button"
                          disabled={reviewBusy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Release this score and feedback to the student?",
                              )
                            )
                              saveGrade(row, true);
                          }}
                        >
                          <Eye size={15} /> Release result
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {tab === "analytics" && (
            <>
              <div className="workspace-toolbar analytics-toolbar">
                <div>
                  <h2>Assessment analytics</h2>
                  <p>
                    Review submission progress and released results for your
                    assignments.
                  </p>
                </div>
                <div className="toolbar-actions analytics-toolbar-actions">
                  <button
                    className="button button-secondary"
                    disabled={analyticsBusy || busy}
                    onClick={() => {
                      setAnalyticsClassId("");
                      setAnalyticsAssignment("");
                      setAnalytics(null);
                      setReleasedResultsOpen(false);
                      setPendingResultsOpen(false);
                      load();
                      loadAnalytics("", "");
                    }}
                  >
                    <RefreshCw size={16} /> Refresh
                  </button>
                  <button
                    className="button"
                    disabled={!analyticsAssignment}
                    onClick={exportReleasedResults}
                  >
                    <Download size={16} /> Export released results CSV
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!analyticsAssignment}
                    onClick={exportReleasedResultsPdf}
                  >
                    <FileText size={16} /> Download PDF report
                  </button>
                </div>
              </div>
              <div className="teacher-metrics analytics-metrics">
                <Metric
                  icon={CheckCircle2}
                  label="Released results"
                  value={analytics?.summary?.releasedResults ?? "—"}
                  onClick={() => {
                    setReleasedResultsOpen((open) => !open);
                    setPendingResultsOpen(false);
                  }}
                />
                <Metric
                  icon={ClipboardList}
                  label="Results not released"
                  value={analytics?.summary?.notReleasedResults ?? "—"}
                  onClick={() => {
                    setPendingResultsOpen((open) => !open);
                    setReleasedResultsOpen(false);
                  }}
                />
              </div>
              {releasedResultsOpen && (
                <section className="analytics-stage-eight-card analytics-class-marks">
                  <div className="teacher-section-heading">
                    <div>
                      <h2>Released results by class and assignment</h2>
                      <p>These grades have been released to students.</p>
                    </div>
                  </div>
                  {analytics?.classMarks?.length ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Class</th>
                            <th>Assignment</th>
                            <th>Student</th>
                            <th>Score</th>
                            <th>Released</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.classMarks.map((mark) => (
                            <tr key={`${mark.assignmentId}-${mark.studentId}`}>
                              <td>{mark.className}</td>
                              <td>{mark.assignmentTitle}</td>
                              <td>{mark.studentName}</td>
                              <td>
                                {mark.score} / {mark.totalMarks}
                              </td>
                              <td>
                                {mark.gradedAt
                                  ? new Date(
                                      `${mark.gradedAt}Z`,
                                    ).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="analytics-stage-eight-empty">
                      No results have been released yet.
                    </p>
                  )}
                </section>
              )}
              {pendingResultsOpen && (
                <section className="analytics-stage-eight-card analytics-class-marks">
                  <div className="teacher-section-heading">
                    <div>
                      <h2>
                        Unreleased results of classes and assignments by teacher
                      </h2>
                      <p>Submissions still awaiting release result.</p>
                    </div>
                  </div>
                  {analytics?.assignments?.some(
                    (assignment) => assignment.pendingGradeCount > 0,
                  ) ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Class</th>
                            <th>Assignment</th>
                            <th>Results not released</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.assignments
                            .filter(
                              (assignment) => assignment.pendingGradeCount > 0,
                            )
                            .map((assignment) => (
                              <tr key={assignment.id}>
                                <td>{assignment.className}</td>
                                <td>{assignment.title}</td>
                                <td>{assignment.pendingGradeCount}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="analytics-stage-eight-empty">
                      All submitted results have been released.
                    </p>
                  )}
                </section>
              )}
              <div className="form-field analytics-filter">
                <label htmlFor="analytics-class">Select class</label>
                <select
                  id="analytics-class"
                  value={analyticsClassId}
                  onChange={(e) => {
                    setAnalyticsClassId(e.target.value);
                    setAnalyticsAssignment("");
                    setReleasedResultsOpen(false);
                    setPendingResultsOpen(false);
                    setAnalytics(null);
                    if (e.target.value) loadAnalytics("", e.target.value);
                  }}
                >
                  <option value="">Select a class</option>
                  {activeClasses.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name} — {classItem.subject}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field analytics-filter">
                <label htmlFor="analytics-assignment">
                  Choose an assignment
                </label>
                <select
                  id="analytics-assignment"
                  value={analyticsAssignment}
                  disabled={!analyticsClassId}
                  onChange={(e) => {
                    setAnalyticsAssignment(e.target.value);
                    setReleasedResultsOpen(false);
                    setPendingResultsOpen(false);
                    loadAnalytics(e.target.value, analyticsClassId);
                  }}
                >
                  <option value="">
                    {analyticsClassId
                      ? "Select an assignment"
                      : "Choose a class first"}
                  </option>
                  {assignments
                    .filter(
                      (a) => String(a.classId) === String(analyticsClassId),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} — {a.className}
                      </option>
                    ))}
                </select>
              </div>
              {analyticsBusy ? (
                <Loading />
              ) : !analyticsClassId ? (
                <div className="empty-workspace">
                  <BarChart3 size={24} />
                  <strong>Choose a class</strong>
                  <span>Select a class to view its submissions and performance.</span>
                </div>
              ) : !analytics ? (
                <div className="empty-workspace">
                  <BarChart3 size={24} />
                  <strong>Analytics unavailable</strong>
                  <span>Refresh to try loading your results.</span>
                </div>
              ) : (
                <>
                  {analytics.classReport && (
                    <>
                      <section className="analytics-stage-eight-card analytics-class-marks">
                        <div className="teacher-section-heading">
                          <div>
                            <h2>Class performance</h2>
                            <p>{analytics.classReport.class.name} · class-wide results and active student roster.</p>
                          </div>
                        </div>
                        <div className="analytics-stats-grid">
                          <div><span>Active students</span><strong>{analytics.classReport.classPerformance.activeStudents}</strong></div>
                          <div><span>Assignments</span><strong>{analytics.classReport.classPerformance.assignments}</strong></div>
                          <div><span>Submissions</span><strong>{analytics.classReport.classPerformance.submissions}</strong></div>
                          <div><span>Awaiting review/release</span><strong>{analytics.classReport.classPerformance.awaitingReview}</strong></div>
                          <div><span>Released results</span><strong>{analytics.classReport.classPerformance.releasedResults}</strong></div>
                          <div><span>Average released mark</span><strong>{analytics.classReport.classPerformance.averageReleasedPercent == null ? "—" : `${analytics.classReport.classPerformance.averageReleasedPercent}%`}</strong></div>
                        </div>
                      </section>

                      <section className="analytics-stage-eight-card analytics-class-marks">
                        <div className="teacher-section-heading">
                          <div>
                            <h2>Class submission overview</h2>
                            <p>Shows each active student’s submission status for the selected assignment, or all published/closed assignments.</p>
                          </div>
                        </div>
                        {analytics.classReport.submissionOverview.assignments.length ? (
                          <div className="admin-table-wrap">
                            <table className="admin-table">
                              <thead><tr><th>Student</th><th>Email</th>{analytics.classReport.submissionOverview.assignments.map((a) => <th key={a.id}>{a.title}</th>)}</tr></thead>
                              <tbody>{analytics.classReport.submissionOverview.students.map((student) => (
                                <tr key={student.studentId}>
                                  <td>{student.studentName}</td><td>{student.studentEmail}</td>
                                  {student.assignments.map((item) => <td key={item.assignmentId}><span className={`status-pill ${item.status === "submitted" ? "published" : "active"}`}>{item.status === "submitted" ? "Submitted" : "Not submitted"}</span></td>)}
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        ) : <p className="analytics-stage-eight-empty">No published or closed assignments are available for this class.</p>}
                      </section>

                      <section className="analytics-stage-eight-card analytics-class-marks">
                        <div className="teacher-section-heading"><div><h2>Individual performance</h2><p>Released scores for each student across assignments in this class.</p></div></div>
                        {analytics.classReport.individualPerformance.length ? (
                          <div className="admin-table-wrap"><table className="admin-table">
                            <thead><tr><th>Student</th><th>Released assignments</th><th>Average</th><th>Assignment marks</th></tr></thead>
                            <tbody>{analytics.classReport.individualPerformance.map((student) => <tr key={student.studentId}>
                              <td>{student.studentName}<small>{student.studentEmail}</small></td>
                              <td>{student.results.length}</td><td>{student.averagePercent == null ? "No grades" : `${student.averagePercent}%`}</td>
                              <td><details><summary>View marks</summary><ul className="analytics-history-marks">{student.results.map((item) => <li key={item.assignmentId}>{item.assignmentTitle}: {item.score}/{item.totalMarks} ({item.percentage}%)</li>)}</ul></details></td>
                            </tr>)}</tbody>
                          </table></div>
                        ) : <p className="analytics-stage-eight-empty">No active students are enrolled in this class.</p>}
                      </section>

                      <section className="analytics-stage-eight-card analytics-class-marks">
                        <div className="teacher-section-heading"><div><h2>Performance trends</h2><p>Class average percentage by assignment over time. Unreleased grades are excluded.</p></div></div>
                        {analytics.classReport.performanceTrends.length ? (
                          <div className="analytics-trend-list">{analytics.classReport.performanceTrends.map((point) => <div className="analytics-trend-row" key={point.assignmentId}>
                            <div><strong>{point.assignmentTitle}</strong><small>{point.assignmentCreatedAt ? new Date(`${point.assignmentCreatedAt}Z`).toLocaleDateString() : "Date unavailable"} · {point.gradedCount} released</small></div>
                            <div className="analytics-trend-track"><span style={{ width: `${Math.max(0, Math.min(100, point.averagePercent || 0))}%` }} /></div>
                            <b>{point.averagePercent == null ? "No results" : `${point.averagePercent}%`}</b>
                          </div>)}</div>
                        ) : <p className="analytics-stage-eight-empty">Assignment history will appear here.</p>}
                      </section>

                      <section className="analytics-stage-eight-card analytics-class-marks">
                        <div className="teacher-section-heading"><div><h2>Assignment history</h2><p>Past and current assignment records, including archived assignments.</p></div></div>
                        {analytics.classReport.assignmentHistory.length ? (
                          <div className="admin-table-wrap"><table className="admin-table">
                            <thead><tr><th>Assignment</th><th>Status</th><th>Created</th><th>Submissions</th><th>Results released</th></tr></thead>
                            <tbody>{analytics.classReport.assignmentHistory.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.status}</td><td>{item.createdAt ? new Date(`${item.createdAt}Z`).toLocaleDateString() : "—"}</td><td>{item.submissionCount}</td><td>{item.releasedCount}</td></tr>)}</tbody>
                          </table></div>
                        ) : <p className="analytics-stage-eight-empty">No assignment history yet.</p>}
                      </section>
                    </>
                  )}
                  <div className="analytics-summary-card">
                    <div>
                      <span className="section-kicker">
                        RELEASED GRADES ONLY
                      </span>
                      <h2>
                        {analytics.summary.overallAveragePercent === null
                          ? "No released scores yet"
                          : `${analytics.summary.overallAveragePercent}%`}
                      </h2>
                      <p>
                        Average percentage across assignments with released
                        grades. Each assignment contributes equally to this
                        summary.
                      </p>
                    </div>
                  </div>
                  <div className="analytics-stage-eight-grid">
                    <section className="analytics-stage-eight-card">
                      <div className="teacher-section-heading">
                        <div>
                          <h2>AI grading reliability</h2>
                          <p>
                            Latest saved AI suggestions compared with
                            teacher-released scores.
                          </p>
                        </div>
                      </div>
                      {analytics.reliability?.comparedResults ? (
                        <div className="analytics-reliability-stats">
                          <div>
                            <span>Compared results</span>
                            <strong>
                              {analytics.reliability.comparedResults}
                            </strong>
                          </div>
                          <div>
                            <span>Average score difference</span>
                            <strong>
                              {
                                analytics.reliability
                                  .meanAbsoluteDifferencePercent
                              }
                              %
                            </strong>
                          </div>
                          <div>
                            <span>Within 5 percentage points</span>
                            <strong>
                              {analytics.reliability.withinFivePercentRate}%
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <p className="analytics-stage-eight-empty">
                          No released grades with saved AI suggestions to
                          compare yet.
                        </p>
                      )}
                    </section>
                    <section className="analytics-stage-eight-card">
                      <div className="teacher-section-heading">
                        <div>
                          <h2>Knowledge gap signals</h2>
                          <p>
                            Questions averaging below 70% on released question
                            grades.
                          </p>
                        </div>
                      </div>
                      {analytics.knowledgeGaps?.length ? (
                        <div className="analytics-knowledge-gaps">
                          {analytics.knowledgeGaps.map((gap) => (
                            <div
                              className="analytics-knowledge-gap"
                              key={`${gap.assignmentId}-${gap.questionIndex}`}
                            >
                              <div>
                                <strong>{gap.assignmentTitle}</strong>
                                <span>
                                  {gap.className} · Q{gap.questionIndex + 1}:{" "}
                                  {gap.questionText}
                                </span>
                              </div>
                              <b>{gap.averagePercent}%</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="analytics-stage-eight-empty">
                          No question-level gaps detected yet. Release question
                          grades to build this view.
                        </p>
                      )}
                    </section>
                  </div>
                  <section
                    id="released-class-marks"
                    className="analytics-stage-eight-card analytics-class-marks"
                    hidden
                  >
                    <div className="teacher-section-heading">
                      <div>
                        <h2>Class marks table</h2>
                        <p>Released results for your students.</p>
                      </div>
                    </div>
                    {analytics.classMarks?.length ? (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Class</th>
                              <th>Assignment</th>
                              <th>Student</th>
                              <th>Score</th>
                              <th>Percentage</th>
                              <th>Released</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.classMarks.map((mark) => (
                              <tr
                                key={`${mark.assignmentId}-${mark.studentId}`}
                              >
                                <td>{mark.className}</td>
                                <td>{mark.assignmentTitle}</td>
                                <td>
                                  {mark.studentName}
                                  <small>{mark.studentEmail}</small>
                                </td>
                                <td>
                                  {mark.score} / {mark.totalMarks}
                                </td>
                                <td>{mark.percent}%</td>
                                <td>
                                  {mark.gradedAt
                                    ? new Date(
                                        `${mark.gradedAt}Z`,
                                      ).toLocaleDateString()
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="analytics-stage-eight-empty">
                        Released grades will appear here.
                      </p>
                    )}
                  </section>
                  {!analytics.assignments.length ? (
                    <div className="empty-workspace">
                      <ClipboardList size={24} />
                      <strong>No assignment data</strong>
                      <span>
                        Create assignments and collect submissions to see
                        analytics.
                      </span>
                    </div>
                  ) : (
                    <div className="analytics-assignment-list">
                      {analytics.assignments.map((a) => (
                        <article className="analytics-card" key={a.id}>
                          <div className="analytics-card-heading">
                            <div>
                              <span className={`status-pill ${a.status}`}>
                                {a.status}
                              </span>
                              <h3>{a.title}</h3>
                              <p>
                                {a.className} · {a.totalMarks} total marks
                              </p>
                            </div>
                            <button
                              className="mini-action"
                              onClick={() => {
                                setTab("review");
                                setReviewClassId(String(a.classId));
                                setReviewAssignment(String(a.id));
                                loadReview(String(a.id));
                              }}
                            >
                              Review submissions
                            </button>
                          </div>
                          <div className="analytics-stats-grid">
                            <div>
                              <span>Enrolled</span>
                              <strong>{a.enrolledCount}</strong>
                            </div>
                            <div>
                              <span>Submitted</span>
                              <strong>{a.submissionCount}</strong>
                            </div>
                            <div>
                              <span>Awaiting grade</span>
                              <strong>{a.pendingGradeCount}</strong>
                            </div>
                            <div>
                              <span>Average released score</span>
                              <strong>
                                {a.averageScore === null
                                  ? "—"
                                  : `${a.averageScore} / ${a.totalMarks}`}
                              </strong>
                            </div>
                          </div>
                          <div className="analytics-progress-block">
                            <div>
                              <span>Submission completion</span>
                              <strong>
                                {a.completionRate === null
                                  ? "No students"
                                  : `${a.completionRate}%`}
                              </strong>
                            </div>
                            <div className="analytics-progress-track">
                              <span
                                style={{
                                  width: `${Math.min(100, a.completionRate || 0)}%`,
                                }}
                              />
                            </div>
                            <div>
                              <span>Grading progress</span>
                              <strong>
                                {a.gradingRate === null
                                  ? "No submissions"
                                  : `${a.gradingRate}%`}
                              </strong>
                            </div>
                            <div className="analytics-progress-track">
                              <span
                                style={{
                                  width: `${Math.min(100, a.gradingRate || 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                          {a.questionStats?.length > 0 && (
                            <div className="analytics-question-stats">
                              <h4>Question performance</h4>
                              {a.questionStats.map((q) => (
                                <div
                                  className="analytics-question-row"
                                  key={q.questionIndex}
                                >
                                  <div>
                                    <strong>Q{q.questionIndex + 1}</strong>
                                    <span>{q.questionText}</span>
                                  </div>
                                  <div>
                                    <strong>
                                      {q.averageScore === null
                                        ? "—"
                                        : `${q.averageScore} / ${q.maxMarks}`}
                                    </strong>
                                    <small>
                                      {q.averagePercent === null
                                        ? ""
                                        : `${q.averagePercent}% average`}
                                    </small>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="analytics-distribution">
                            <h4>Released score distribution</h4>
                            <div className="score-buckets">
                              {a.scoreDistribution.map((b) => (
                                <div className="score-bucket" key={b.label}>
                                  <div className="score-bucket-track">
                                    <span
                                      style={{
                                        height: `${a.gradedCount ? Math.max(3, (b.count / a.gradedCount) * 100) : 0}%`,
                                      }}
                                    />
                                  </div>
                                  <strong>{b.count}</strong>
                                  <small>{b.label}</small>
                                </div>
                              ))}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="analytics-notes">
                    <strong>How to read these metrics</strong>
                    <ul>
                      {analytics.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "questions" && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>Question paper workspace</h2>
                  <p>
                    Upload PDF, DOCX, or TXT files, extract selectable text, and
                    review editable question candidates.
                  </p>
                </div>
              </div>
              <div className="question-upload-card">
                <div className="upload-icon">
                  <FileUp size={22} />
                </div>
                <h3>Upload a question paper</h3>
                  <p>
                    Supported formats: PDF, DOCX, and TXT. Maximum 10 MB. Scanned
                    PDFs without selectable text cannot be extracted here.
                  </p>
                <label className="button upload-button">
                  {paperBusy ? "Processing…" : "Choose question paper"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(e) =>
                      readQuestionPaper(e.target.files?.[0] || null)
                    }
                    hidden
                    disabled={paperBusy}
                  />
                </label>
                {questionFile && (
                  <p className="file-picked">Selected: {questionFile.name}</p>
                )}
                {uploadMessage && (
                  <div className="dash-alert info">
                    <AlertCircle size={17} />
                    {uploadMessage}
                  </div>
                )}
              </div>
              <div className="question-paper-library">
                <div className="teacher-section-heading">
                  <div>
                    <h2>Saved question papers</h2>
                    <p>Your uploaded files and extracted questions.</p>
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={paperBusy}
                    onClick={async () => {
                      setPaperBusy(true);
                      await loadQuestionPapers();
                      setPaperBusy(false);
                    }}
                  >
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>
                {questionPapers.length === 0 ? (
                  <div className="empty-workspace">
                    <FileText size={24} />
                    <strong>No saved papers yet</strong>
                    <span>Upload a PDF, DOCX, or TXT file to get started.</span>
                  </div>
                ) : (
                  <div className="assignment-list">
                    {questionPapers.map((p) => (
                      <article className="assignment-row" key={p.id}>
                        <div className="assignment-symbol">
                          <FileText size={20} />
                        </div>
                        <div className="assignment-info">
                          <h3>{p.title}</h3>
                          <p>
                            {p.originalName} · {p.questionCount} detected
                            questions ·{" "}
                            {Math.max(1, Math.round(p.fileSize / 1024))} KB
                          </p>
                        </div>
                        <button
                          className="mini-action primary"
                          onClick={() => openQuestionPaper(p.id)}
                        >
                          Open & edit
                        </button>
                        <button
                          className="mini-action primary"
                          disabled={paperBusy}
                          onClick={() => startAssessmentBuilder(p.id)}
                        >
                          <ClipboardList size={14} /> Build assessment
                        </button>
                        <button
                          className="mini-action"
                          disabled={paperBusy}
                          onClick={() => deleteQuestionPaper(p.id)}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              {selectedPaper && (
                <div className="question-upload-card question-editor-card">
                  <div className="teacher-section-heading">
                    <div>
                      <h2>Edit extracted questions</h2>
                      <p>
                        Auto-detection uses question-number patterns. Verify
                        every question and mark value.
                      </p>
                    </div>
                    <button
                      className="button"
                      disabled={paperBusy}
                      onClick={saveQuestionPaper}
                    >
                      <Save size={16} /> Save changes
                    </button>
                  </div>
                  <div className="form-field">
                    <label htmlFor="paper-title">Paper title</label>
                    <input
                      id="paper-title"
                      value={paperTitle}
                      onChange={(e) => setPaperTitle(e.target.value)}
                      maxLength={180}
                    />
                  </div>
                  {questionDrafts.length === 0 && (
                    <div className="dash-alert info">
                      No numbered questions were detected. Add questions
                      manually below.
                    </div>
                  )}
                  {questionDrafts.map((q, i) => (
                    <div
                      className="question-edit-row"
                      key={`${selectedPaper.id}-${i}`}
                    >
                      <div className="question-edit-heading">
                        <strong>Question {i + 1}</strong>
                        <button
                          className="mini-action"
                          onClick={() =>
                            setQuestionDrafts((rows) =>
                              rows.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      </div>
                      <textarea
                        value={q.text}
                        rows={3}
                        maxLength={10000}
                        onChange={(e) =>
                          updateQuestion(i, "text", e.target.value)
                        }
                        aria-label={`Question ${i + 1} text`}
                      />
                      <div className="form-field">
                        <label>Marks (optional)</label>
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step="0.5"
                          value={q.marks ?? ""}
                          onChange={(e) =>
                            updateQuestion(i, "marks", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <div className="question-editor-actions">
                    <button
                      className="button button-secondary"
                      onClick={addQuestion}
                      disabled={questionDrafts.length >= 200}
                    >
                      <Plus size={16} /> Add question
                    </button>
                    <button
                      className="button"
                      onClick={saveQuestionPaper}
                      disabled={paperBusy}
                    >
                      <Save size={16} /> Save question paper
                    </button>
                  </div>
                  <details className="extracted-text-details">
                    <summary>View extracted source text</summary>
                    <textarea value={extractedText} readOnly rows={10} />
                    <small>
                      Extracted source text is stored for review. Scanned PDFs
                      without selectable text cannot be extracted here.
                    </small>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {builderOpen && (
        <Modal
          title="Build assessment from question paper"
          onClose={() => setBuilderOpen(false)}
        >
          <form onSubmit={createAssessmentFromPaper}>
            <p className="modal-note">
              Choose a class, select the questions, and set marks. The total is
              calculated automatically. The assessment is saved as a draft.
            </p>
            <div className="form-field">
              <label htmlFor="builder-class">Class</label>
              <select
                id="builder-class"
                required
                value={builderForm.classId}
                onChange={(e) =>
                  setBuilderForm((f) => ({ ...f, classId: e.target.value }))
                }
              >
                <option value="">Select a class</option>
                {editingAssignmentId &&
                  !activeClasses.some(
                    (classItem) => String(classItem.id) === assignmentForm.classId,
                  ) && (
                    <option value={assignmentForm.classId}>
                      {editingAssignmentClass}
                    </option>
                  )}
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.subject}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Assessment title"
              value={builderForm.title}
              onChange={(v) => setBuilderForm((f) => ({ ...f, title: v }))}
              required
              maxLength={160}
            />
            <Field
              label="Instructions (optional)"
              value={builderForm.instructions}
              onChange={(v) =>
                setBuilderForm((f) => ({ ...f, instructions: v }))
              }
              textarea
              maxLength={10000}
              placeholder="Instructions for students"
            />
            <Field
              label="Due date (optional)"
              value={builderForm.dueAt}
              onChange={(v) => setBuilderForm((f) => ({ ...f, dueAt: v }))}
              type="datetime-local"
            />
            <div className="builder-question-list">
              <div className="teacher-section-heading">
                <div>
                  <h3>Select questions</h3>
                  <p>
                    {builderQuestions.filter((q) => q.included).length} selected
                    · Total{" "}
                    {builderQuestions
                      .filter((q) => q.included)
                      .reduce((sum, q) => sum + Number(q.marks || 0), 0)}{" "}
                    marks
                  </p>
                </div>
              </div>
              {builderQuestions.map((q, i) => (
                <div
                  className="builder-question-row"
                  key={`${q.sourceIndex}-${i}`}
                >
                  <label className="builder-question-select">
                    <input
                      type="checkbox"
                      checked={q.included}
                      onChange={(e) =>
                        setBuilderQuestions((rows) =>
                          rows.map((item, j) =>
                            j === i
                              ? { ...item, included: e.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>
                      <strong>Question {i + 1}</strong>
                      <small>{q.text}</small>
                    </span>
                  </label>
                  <label className="builder-marks-field">
                    Marks
                    <input
                      type="number"
                      min="0.5"
                      max="10000"
                      step="0.5"
                      value={q.marks}
                      disabled={!q.included}
                      onChange={(e) =>
                        setBuilderQuestions((rows) =>
                          rows.map((item, j) =>
                            j === i ? { ...item, marks: e.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setBuilderOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button"
                disabled={
                  paperBusy ||
                  !activeClasses.length ||
                  !builderQuestions.some((q) => q.included)
                }
              >
                {paperBusy ? "Creating…" : "Save assessment draft"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {classModal && (
        <Modal title="Create a class" onClose={() => setClassModal(false)}>
          <form onSubmit={createClass}>
            <Field
              label="Class name"
              value={classForm.name}
              onChange={(v) => setClassForm((p) => ({ ...p, name: v }))}
              placeholder="e.g. Grade 10 — Section A"
              required
              maxLength={120}
            />
            <Field
              label="Subject"
              value={classForm.subject}
              onChange={(v) => setClassForm((p) => ({ ...p, subject: v }))}
              placeholder="e.g. Mathematics"
              required
              maxLength={120}
            />
            <Field
              label="Description (optional)"
              value={classForm.description}
              onChange={(v) => setClassForm((p) => ({ ...p, description: v }))}
              placeholder="What will this class cover?"
              textarea
              maxLength={2000}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setClassModal(false)}
              >
                Cancel
              </button>
              <button className="button" disabled={busy}>
                {busy ? "Saving…" : "Create class"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {membersOpen && selectedClass && (
        <Modal
          title={`${selectedClass.name} members`}
          onClose={() => setMembersOpen(false)}
        >
          <div className="class-members-section">
            <h3>Owner</h3>
            <div className="class-member-row">
              <span>{selectedClass.teacherName || user.fullName}</span>
              <span className="class-member-tag owner">Owner</span>
            </div>
          </div>
          <div className="class-members-section">
            <h3>Members</h3>
            <div className="class-member-list">
              {membersBusy ? (
                <p className="class-members-empty">Loading members…</p>
              ) : classMembers.length ? (
                classMembers.map((member) => (
                  <div className="class-member-row" key={member.id}>
                    <span>{member.email}</span>
                    <span className="class-member-tag">Student</span>
                  </div>
                ))
              ) : (
                <p className="class-members-empty">
                  No students have joined this class yet.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
      {assignmentModal && (
        <Modal
          title={editingAssignmentId ? "Edit assignment" : "Create an assignment"}
          onClose={() => setAssignmentModal(false)}
        >
          <form onSubmit={createAssignment}>
            {assignmentFormError && (
              <div className="dash-alert error" role="alert">
                {assignmentFormError}
              </div>
            )}
            <div className="form-field">
              <label htmlFor="assignment-class">Class</label>
              <select
                id="assignment-class"
                required
                disabled={Boolean(editingAssignmentId)}
                value={assignmentForm.classId}
                onChange={(e) =>
                  setAssignmentForm((p) => ({ ...p, classId: e.target.value }))
                }
              >
                <option value="">Select a class</option>
                {activeClasses.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} — {c.subject}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Assignment title"
              value={assignmentForm.title}
              onChange={(v) => setAssignmentForm((p) => ({ ...p, title: v }))}
              placeholder="e.g. Chapter 3 assessment"
              required
              maxLength={160}
            />
            <Field
              label="Instructions"
              value={assignmentForm.instructions}
              onChange={(v) =>
                setAssignmentForm((p) => ({ ...p, instructions: v }))
              }
              placeholder="Add instructions or paste questions here"
              textarea
              maxLength={10000}
            />
            <div className="form-field">
              <label htmlFor="assignment-attachment">
                {editingAssignmentId
                  ? "Replace assignment attachment (optional)"
                  : "Attach assignment file (PDF / DOC / DOCX)"}
              </label>

              <input
                id="assignment-attachment"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) =>
                  setAssignmentAttachment(e.target.files?.[0] || null)
                }
              />

              {assignmentAttachment && (
                <p className="file-picked">
                  Selected: {assignmentAttachment.name}
                </p>
              )}

              <small>
                {editingAssignmentId
                  ? "Upload a new file only if you want to replace the current attachment."
                  : "Students can download this file when they open the assignment."}
              </small>
            </div>
            <Field
              label="Total marks"
              value={assignmentForm.totalMarks}
              onChange={(v) =>
                setAssignmentForm((p) => ({ ...p, totalMarks: v }))
              }
              type="number"
              required
              min="1"
              max="10000"
            />
            <Field
              label="Due date (optional)"
              value={assignmentForm.dueAt}
              onChange={(v) => setAssignmentForm((p) => ({ ...p, dueAt: v }))}
              type="datetime-local"
            />
            <div className="modal-note">
              {editingAssignmentId
              ? "Update the assignment details or total marks, or replace its attachment. Individual questions and their marks are not editable here."
                : "New assignments are saved as drafts. You can publish them from the assignments list."}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setAssignmentModal(false)}
              >
                Cancel
              </button>
              <button
                className="button"
                disabled={busy || (!editingAssignmentId && !activeClasses.length)}
              >
                {busy
                  ? editingAssignmentId
                    ? "Updating…"
                    : "Saving…"
                  : editingAssignmentId
                    ? "Save changes"
                    : "Save draft"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {submissionPreview && (
        <Modal
          title={submissionPreview.row.fileName}
          onClose={() => setSubmissionPreview(null)}
          className="submission-preview-modal"
        >
          <div className="submission-preview-student">
            <strong>{submissionPreview.row.studentName}</strong>
            <span>{submissionPreview.row.studentEmail}</span>
          </div>
          {previewBusy || submissionPreview.kind === "loading" ? (
            <div className="submission-preview-message">Opening submitted file…</div>
          ) : submissionPreview.kind === "pdf" ? (
            <iframe
              className="submission-pdf-frame"
              src={submissionPreview.url}
              title={"Preview of " + submissionPreview.row.fileName}
            />
          ) : submissionPreview.kind === "text" ? (
            <pre className="submission-docx-preview">{submissionPreview.text}</pre>
          ) : (
            <div className="submission-preview-message">
              This Word document format cannot be previewed in the browser. You can download it here.
            </div>
          )}
          <div className="modal-actions submission-preview-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => downloadSubmissionFile(submissionPreview.row)}
            >
              <Download size={15} /> Download file
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setSubmissionPreview(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({ icon: Icon, label, value, onClick }) {
  return (
    <article
      className="teacher-metric clickable-metric"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="metric-icon">
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="dash-search">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
function Loading() {
  return <div className="empty-workspace">Loading workspace…</div>;
}
function ClassGrid({ rows, onSelect }) {
  const [copiedClassId, setCopiedClassId] = useState(null);
  if (!rows.length)
    return (
      <div className="empty-workspace">
        <BookOpen size={24} />
        <strong>No classes found</strong>
        <span>Create a class to start organizing your students.</span>
      </div>
    );
  return (
    <div className="class-grid">
      {rows.map((c) => (
        <article
          className={`class-card${onSelect ? " clickable-class-card" : ""}`}
          key={c.id}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onClick={() => onSelect?.(c)}
          onKeyDown={(event) => {
            if (onSelect && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelect(c);
            }
          }}
        >
          <div className="class-card-top">
            <span className="class-symbol">
              <BookOpen size={20} />
            </span>
            <span className={`status-pill ${c.status}`}>{c.status}</span>
          </div>
          <h3>{c.name}</h3>
          <p>{c.subject}</p>
          {c.description && (
            <p className="class-description">{c.description}</p>
          )}
          <div className="class-stats">
            <span>
              <Users size={15} />
              {c.studentCount || 0} students
            </span>
            <span>Created {String(c.createdAt || "").slice(0, 10) || "—"}</span>
          </div>
          {c.enrollmentCode && (
            <div className="enrollment-code">
              <span>Enrollment code</span>
              <strong>{c.enrollmentCode}</strong>
              <button
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(c.enrollmentCode);
                    setCopiedClassId(c.id);
                    window.setTimeout(() => setCopiedClassId(null), 2000);
                  } catch {
                    setCopiedClassId(null);
                  }
                }}
                onKeyDown={(event) => event.stopPropagation()}
                type="button"
              >
                {copiedClassId === c.id ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
function AssignmentTable({ rows, onAction, onEdit }) {
  if (!rows.length)
    return (
      <div className="empty-workspace">
        <ClipboardList size={24} />
        <strong>No assignments yet</strong>
        <span>Create a draft assignment to get started.</span>
      </div>
    );
  return (
    <div className="assignment-list">
      {rows.map((a) => (
        <article className="assignment-row" key={a.id}>
          <div className="assignment-symbol">
            <FileText size={20} />
          </div>
          <div className="assignment-info">
            <h3>{a.title}</h3>
            <p>
              {a.className || "Class"} · {a.totalMarks} marks
              {a.dueAt ? ` · Due ${new Date(a.dueAt).toLocaleString()}` : ""}
            </p>
          </div>
          <span className={`status-pill ${a.status}`}>{a.status}</span>
          <div className="assignment-actions">
            <button
              className="mini-action"
              onClick={() => onEdit?.(a)}
              title="Edit assignment details or replace its attachment"
            >
              <Pencil size={14} /> Edit
            </button>
            {a.status === "draft" && (
              <button
                className="mini-action primary"
                onClick={() => onAction(a.id, "publish")}
              >
                <Send size={14} /> Publish
              </button>
            )}
            {a.status === "published" && (
              <button
                className="mini-action"
                onClick={() => onAction(a.id, "close")}
              >
                Close
              </button>
            )}
            <button
              className="mini-action danger"
              onClick={() => onAction(a.id, "delete")}
              title="Delete assignment"
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
function Modal({ title, onClose, children, className = "" }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`workspace-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  maxLength,
  textarea = false,
  min,
  max,
}) {
  return (
    <div className="form-field">
      <label>{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          rows={4}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          min={min}
          max={max}
        />
      )}
    </div>
  );
}
