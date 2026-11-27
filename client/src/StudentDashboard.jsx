import React from "react";
import Notifications from "./Notifications.jsx";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BookOpen,
  ClipboardList,
  LogOut,
  GraduationCap,
  Plus,
  Search,
  Send,
  CheckCircle2,
  Clock3,
  X,
  TrendingUp,
  Target,
  Lightbulb,
} from "lucide-react";
import { API_BASE } from "./apiConfig.js";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000,
});
const errText = (e) =>
  e.response?.data?.error?.message ||
  "Could not connect to the server. Confirm the backend is running.";
const dateText = (value) =>
  value
    ? new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "No due date";

export default function StudentDashboard({ user, setUser }) {
  const [tab, setTab] = useState("Dashboard");
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("recent");
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [activeClass, setActiveClass] = useState(null);
  const [answer, setAnswer] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedMB, setUploadedMB] = useState(0);
  const [totalFileMB, setTotalFileMB] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [displayProgress, setDisplayProgress] = useState(0);
  const [activeClassAssignments, setActiveClassAssignments] = useState([]);

  useEffect(() => {
    if (displayProgress >= uploadProgress) return;

    const timer = setTimeout(() => {
      setDisplayProgress((current) => {
        const difference = uploadProgress - current;
        const step = Math.max(1, Math.ceil(difference / 12));

        return Math.min(current + step, uploadProgress);
      });
    }, 30);

    return () => clearTimeout(timer);
  }, [displayProgress, uploadProgress]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [c, a, s] = await Promise.all([
        api.get("/classes"),
        api.get("/assignments"),
        api.get("/submissions/mine"),
      ]);
      setClasses(c.data.classes || []);
      console.log("Student classes:", c.data.classes);
      setAssignments(a.data.assignments || []);
      setSubmissions(s.data.submissions || []);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const submittedByAssignment = useMemo(
    () => new Map(submissions.map((s) => [s.assignmentId, s])),
    [submissions],
  );
  const activeSubmission = activeAssignment
    ? submittedByAssignment.get(activeAssignment.id)
    : null;

  console.log("Opened class:", activeClass);
  console.log("All assignments:", assignments);
  console.log("Assignments for opened class:", activeClassAssignments);
  const filteredAssignments = assignments.filter((a) => {
    const matchesSearch = `${a.title} ${a.className} ${a.classSubject}`
      .toLowerCase()
      .includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const submission = submittedByAssignment.get(a.id);
    const isSubmitted = Boolean(submission);
    const hasDueDate = Boolean(a.dueAt);
    const isPastDue = hasDueDate && Date.parse(a.dueAt) < Date.now();

    if (assignmentFilter === "recent") {
      return !isSubmitted && (!hasDueDate || !isPastDue);
    }

    if (assignmentFilter === "pastDue") {
      return !isSubmitted && isPastDue;
    }

    if (assignmentFilter === "completed") {
      return isSubmitted;
    }

    return true;
  });

  const overviewAssignments = assignments.filter((a) => {
    if (!a.dueAt) return true;

    const dueDate = new Date(a.dueAt);
    const hideAfter = new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000);

    return new Date() <= hideAfter;
  });
  async function joinClass(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const r = await api.post("/enrollments/join", {
        enrollmentCode: code.trim().toUpperCase(),
      });
      setCode("");
      setNotice(r.data.message || "You joined the class.");
      await load();
      setTab("classes");
    } catch (e) {
      setError(errText(e));
    }
  }
  function openAssignment(a) {
    const previous = submittedByAssignment.get(a.id);
    setActiveAssignment(a);
    setSelectedFileName("");
    setFileError("");
    setUploadProgress(0);
    setUploadedMB(0);
    setTotalFileMB(0);
    setAnswer(previous?.answerText || "");
    setQuestionAnswers(
      (a.questions || []).map((q, i) => ({
        questionIndex: i,
        answerText:
          previous?.answers?.find((x) => x.questionIndex === i)?.answerText ||
          "",
      })),
    );
    setError("");
    setNotice("");
  }
  async function onOpenClass(c) {
    setActiveClass(c);
    setSearch("");
    setAssignmentFilter("recent");
    setError("");
    setNotice("");

    try {
      const r = await api.get(`/assignments/class/${c.id}`);

      setActiveClassAssignments(r.data.assignments || []);
    } catch (e) {
      setActiveClassAssignments([]);
      setError(errText(e));
    }
  }
  async function submitAnswer(e) {
    e.preventDefault();
    if (!activeAssignment) return;

    const fileInput = document.getElementById("assignmentFile");
    const selectedFile = fileInput?.files?.[0];

    if (!selectedFile) {
      setFileError("Please select a PDF, DOC, or DOCX file.");
      return;
    }

    const allowedExtensions = [".pdf", ".doc", ".docx"];
    const extension = selectedFile.name
      .substring(selectedFile.name.lastIndexOf("."))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      setFileError("Only PDF, DOC, and DOCX files are allowed.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setFileError("File size must be 10 MB or less.");
      return;
    }

    setBusy(true);
    setFileError("");
    setError("");
    setNotice("");

    const uploadStartedAt = Date.now();

    setUploadProgress(0);
    setUploadedMB(0);
    setTotalFileMB(selectedFile.size / (1024 * 1024));

    try {
      const formData = new FormData();
      formData.append("assignmentFile", selectedFile);
      formData.append("answers", JSON.stringify(questionAnswers));

      setUploadProgress(0);
      setUploadedMB(0);
      setTotalFileMB(selectedFile.size / (1024 * 1024));

      const r = await api.post(
        `/submissions/${activeAssignment.id}`,
        formData,
        {
          onUploadProgress: (event) => {
            if (event.total) {
              const percent = Math.round((event.loaded / event.total) * 100);

              setUploadProgress(percent);
              setUploadedMB(event.loaded / (1024 * 1024));
            }
          },
        },
      );

      const elapsed = Date.now() - uploadStartedAt;
      const remaining = Math.max(0, 1800 - elapsed);

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      setUploadProgress(100);
      setDisplayProgress(100);
      setUploadedMB(selectedFile.size / (1024 * 1024));

      setNotice(r.data.message);
      setActiveAssignment(null);

      await load();
      setTab("submissions");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(null);
  }
  const dueSoon = assignments.filter(
    (a) => a.dueAt && Date.parse(a.dueAt) >= Date.now(),
  ).length;
  const releasedResults = submissions.filter(
    (s) =>
      s.gradingStatus === "released" &&
      Number.isFinite(Number(s.score)) &&
      Number(s.totalMarks) > 0,
  );
  const progressStats = useMemo(() => {
    const scored = releasedResults
      .map((s) => ({
        ...s,
        percent: Math.max(
          0,
          Math.min(100, (Number(s.score) / Number(s.totalMarks)) * 100),
        ),
      }))
      .sort(
        (a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0),
      );
    const average = scored.length
      ? scored.reduce((sum, s) => sum + s.percent, 0) / scored.length
      : null;
    const recent = scored.slice(-3);
    const previous = scored.slice(-6, -3);
    const recentAverage = recent.length
      ? recent.reduce((sum, s) => sum + s.percent, 0) / recent.length
      : null;
    const previousAverage = previous.length
      ? previous.reduce((sum, s) => sum + s.percent, 0) / previous.length
      : null;
    const subjectMap = new Map();
    scored.forEach((s) => {
      const subject = s.classSubject || "General";
      const item = subjectMap.get(subject) || { subject, total: 0, count: 0 };
      item.total += s.percent;
      item.count++;
      subjectMap.set(subject, item);
    });
    const subjects = [...subjectMap.values()]
      .map((x) => ({ ...x, average: x.total / x.count }))
      .sort((a, b) => b.average - a.average);
    const questionMap = new Map();
    scored.forEach((s) =>
      (s.answers || [])
        .filter(
          (a) =>
            a.gradingStatus === "released" &&
            Number(a.maxMarks) > 0 &&
            Number.isFinite(Number(a.score)),
        )
        .forEach((a) => {
          const key = `${s.classSubject || "General"} · Question ${Number(a.questionIndex) + 1}`;
          const x = questionMap.get(key) || {
            label: key,
            total: 0,
            max: 0,
            count: 0,
          };
          x.total += Number(a.score);
          x.max += Number(a.maxMarks);
          x.count++;
          questionMap.set(key, x);
        }),
    );
    const questions = [...questionMap.values()]
      .map((x) => ({ ...x, percent: x.max ? (x.total / x.max) * 100 : 0 }))
      .sort((a, b) => a.percent - b.percent);
    return {
      scored,
      average,
      recentAverage,
      previousAverage,
      subjects,
      questions,
    };
  }, [submissions]);
  const studyTips = useMemo(() => {
    const tips = [];
    if (!progressStats.scored.length)
      return [
        "Your results will appear here after your teacher releases a grade. Until then, review your class notes and assignment instructions.",
      ];
    if (progressStats.questions.length) {
      const focus = progressStats.questions[0];
      if (focus.percent < 80)
        tips.push(
          `Review ${focus.label}: your released results suggest this may be a useful area to practise.`,
        );
    }
    if (
      progressStats.recentAverage !== null &&
      progressStats.previousAverage !== null
    )
      tips.push(
        progressStats.recentAverage >= progressStats.previousAverage
          ? "Your average across the most recent graded assignments is holding steady or improving. Keep using the study approach that is working."
          : "Your recent average is below the previous group of graded assignments. Try reviewing teacher feedback and practising the question types you found challenging.",
      );
    if (progressStats.subjects.length)
      tips.push(
        `Use the feedback from ${progressStats.subjects[0].subject} as a guide to identify study habits you can apply in other subjects.`,
      );
    tips.push(
      "Read each released feedback comment and turn it into one specific action for your next assignment.",
    );
    return tips;
  }, [progressStats]);
  return (
    <div className="teacher-app student-app">
      <aside className="teacher-sidebar">
        <div className="teacher-side-brand">
          <img
            src="/smartgrade-logo.png"
            alt="SmartGrade AI Logo"
            className="side-logo-image"
            style={{
              width: "48px",
              height: "48px",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />{" "}
          <span>
            SmartGrade <b>AI</b>
            <small>STUDENT WORKSPACE</small>
          </span>
        </div>
        <div className="side-section-label">LEARNING</div>
        {[
          ["Dashboard", "Dashboard", GraduationCap],
          ["classes", "My classes", BookOpen],
          ["assignments", "Assignments", ClipboardList],
          ["submissions", "My submissions", CheckCircle2],
          ["progress", "Progress & insights", TrendingUp],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            className={`side-nav-item ${tab === key ? "active" : ""}`}
            onClick={() => {
              setTab(key);
              setNotice("");
              setActiveClass(null);
              setActiveAssignment(null);
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
        <div className="teacher-side-bottom">
          <div className="side-user">
            <div className="user-avatar">
              {user.fullName?.slice(0, 1)?.toUpperCase()}
            </div>
            <span>
              <strong>{user.fullName}</strong>
              <small>Student</small>
              <small>{user.email}</small>
            </span>
          </div>
          <button className="side-nav-item" onClick={logout}>
            <LogOut size={17} />
            Log out
          </button>
        </div>
      </aside>
      <section className="teacher-main">
        <header className="teacher-topbar">
          <div>
            <div className="section-kicker">STUDENT WORKSPACE</div>
            <h1>
              {tab === "Dashboard"
                ? "Overview 📋"
                : tab === "classes"
                  ? "My classes"
                  : tab === "assignments"
                    ? "Assignments"
                    : tab === "submissions"
                      ? "My submissions"
                      : "Progress & insights"}
            </h1>
            <p>
              Your learning journey continues here. Explore new concepts, track
              your progress, and turn your goals into achievements.
            </p>
          </div>

          <div className="teacher-top-actions">
            <Notifications />

            <span className="teacher-status">
              <i /> Signed in
            </span>

            <button
              className="button button-secondary"
              onClick={() => {
                setTab("classes");
                document.getElementById("join-code")?.focus();
              }}
            >
              <Plus size={16} /> Join class
            </button>
          </div>
        </header>
        <main className="teacher-content">
          <div className="teacher-greeting">
            <div>
              <div className="section-kicker">WELCOME</div>
              <h2>Ready to explore, learn, and achieve more? </h2>
              <p>Your assignments, your progress, all in one place.</p>
            </div>
            <GraduationCap size={38} />
          </div>
          {error && (
            <div className="dash-alert error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="dash-alert success" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "Dashboard" && (
            <>
              <div className="teacher-metrics">
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <BookOpen size={19} />
                  </div>
                  <span>Enrolled classes</span>
                  <strong>{classes.length}</strong>
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <ClipboardList size={19} />
                  </div>
                  <span>Available assignments</span>
                  <strong>{overviewAssignments.length}</strong>{" "}
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <CheckCircle2 size={19} />
                  </div>
                  <span>Submitted answers</span>
                  <strong>{submissions.length}</strong>
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <Clock3 size={19} />
                  </div>
                  <span>Assignments with due dates</span>
                  <strong>
                    {overviewAssignments.filter((a) => a.dueAt).length}
                  </strong>{" "}
                </div>
              </div>
              <section>
                <div className="teacher-section-heading">
                  <div>
                    <h2>Recent Assignments</h2>
                    <p>Published work from your enrolled classes.</p>
                  </div>
                  <button
                    className="text-action"
                    onClick={() => setTab("assignments")}
                  >
                    View all →
                  </button>
                </div>
                {assignments.length ? (
                  <div className="assignment-list">
                    {overviewAssignments.slice(0, 4).map((a) => (
                      <AssignmentRow
                        key={a.id}
                        a={a}
                        submission={submittedByAssignment.get(a.id)}
                        onOpen={openAssignment}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    icon={ClipboardList}
                    title="No assignments yet"
                    text="Join a class or check again after your teacher publishes an assignment."
                  />
                )}
              </section>
              <section>
                <div className="teacher-section-heading">
                  <div>
                    <h2>Your classes</h2>
                    <p>Classes you have joined.</p>
                  </div>
                  <button
                    className="text-action"
                    onClick={() => setTab("classes")}
                  >
                    View classes →
                  </button>
                </div>
                {classes.length ? (
                  <div className="class-grid">
                    {classes.slice(0, 2).map((c) => (
                      <ClassCard key={c.id} c={c} onOpenClass={onOpenClass} />
                    ))}
                    {classes.length > 2 && (
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => setTab("classes")}
                      >
                        +{classes.length - 2} more classes →
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty
                    icon={BookOpen}
                    title="Join your first class"
                    text="Enter the enrollment code shared by your teacher in My classes."
                  />
                )}
              </section>
            </>
          )}
          {tab === "classes" && activeClass && (
            <section className="student-class-detail">
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  setActiveClass(null);
                  setTab("classes");
                }}
              >
                ← Back to My classes
              </button>

              <div className="workspace-toolbar">
                <div>
                  <h2>{activeClass.name}</h2>
                  <p>
                    {activeClass.subject} · Teacher: {activeClass.teacherName}
                  </p>
                  {activeClass.description && <p>{activeClass.description}</p>}
                </div>
              </div>

              <div className="teacher-section-heading">
                <div>
                  <h2>Class assignments</h2>
                  <p>Assignments published for this class.</p>
                </div>
                <span className="status-pill active">
                  {activeClassAssignments.length} Assignments
                </span>
              </div>

              {activeClassAssignments.length ? (
                <div className="assignment-list">
                  {activeClassAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      a={a}
                      submission={submittedByAssignment.get(a.id)}
                      onOpen={openAssignment}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={ClipboardList}
                  title="No assignments yet"
                  text="Assignments for this class will appear here when your teacher publishes them."
                />
              )}
            </section>
          )}
          {tab === "classes" && !activeClass && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>My classes</h2>
                  <p>Join with the enrollment code your teacher provided.</p>
                </div>
              </div>
              <form className="student-join-form" onSubmit={joinClass}>
                <div className="form-field">
                  <label htmlFor="join-code">Class enrollment code</label>
                  <input
                    id="join-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    placeholder="Enter class code"
                    required
                  />
                </div>
                <button className="button" disabled={!code.trim()}>
                  Join class <Plus size={16} />
                </button>
              </form>
              {classes.length ? (
                <div className="class-grid">
                  {classes.map((c) => (
                    <ClassCard key={c.id} c={c} onOpenClass={onOpenClass} />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={BookOpen}
                  title="No classes joined"
                  text="Enter an enrollment code above to join a class."
                />
              )}
            </>
          )}
          {tab === "assignments" && (
            <>
              <div className="assignment-filter-tabs">
                <button
                  type="button"
                  className={assignmentFilter === "recent" ? "active" : ""}
                  onClick={() => setAssignmentFilter("recent")}
                >
                  Recent
                </button>

                <button
                  type="button"
                  className={assignmentFilter === "pastDue" ? "active" : ""}
                  onClick={() => setAssignmentFilter("pastDue")}
                >
                  Past Due
                </button>

                <button
                  type="button"
                  className={assignmentFilter === "completed" ? "active" : ""}
                  onClick={() => setAssignmentFilter("completed")}
                >
                  Completed
                </button>
              </div>
              {filteredAssignments.length ? (
                <div className="assignment-list">
                  {filteredAssignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      a={a}
                      submission={submittedByAssignment.get(a.id)}
                      onOpen={openAssignment}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={ClipboardList}
                  title="No matching assignments"
                  text="Published assignments for your classes will appear here."
                />
              )}
            </>
          )}
          {tab === "submissions" && (
            <>
              <div className="teacher-section-heading">
                <div>
                  <h2>Submission history</h2>
                  <p>Your submitted answers and their current status.</p>
                </div>
              </div>
              {submissions.length ? (
                <div className="assignment-list">
                  {submissions.map((s) => (
                    <div className="assignment-row" key={s.id}>
                      <div className="assignment-symbol">
                        <CheckCircle2 size={20} />
                      </div>
                      <div className="assignment-info">
                        <h3>{s.assignmentTitle}</h3>
                        <p>
                          {s.className} · Submitted {dateText(s.submittedAt)}
                        </p>
                        <p>
                          {s.answerText.length} characters · You can update the
                          answer while submissions remain open.
                        </p>
                        {s.answers?.length > 0 && (
                          <div className="released-feedback">
                            <strong>Question results</strong>
                            {s.answers.map((a) => (
                              <p key={a.questionIndex}>
                                Q{a.questionIndex + 1}:{" "}
                                {a.gradingStatus === "released"
                                  ? `${a.score} / ${a.maxMarks}`
                                  : "Awaiting released grade"}
                                {a.gradingStatus === "released" && a.feedback
                                  ? ` — ${a.feedback}`
                                  : ""}
                              </p>
                            ))}
                          </div>
                        )}
                        {s.gradingStatus === "released" && (
                          <div className="released-feedback">
                            <strong>
                              Overall result: {s.score} / {s.totalMarks}
                            </strong>
                            {s.feedback && <p>{s.feedback}</p>}
                          </div>
                        )}
                        {s.feedbackHistory?.length > 0 && (
                          <details className="student-feedback-history">
                            <summary>
                              Feedback history ({s.feedbackHistory.length})
                            </summary>
                            <div className="student-feedback-history-list">
                              {s.feedbackHistory.map((entry) => (
                                <article key={entry.id}>
                                  <div>
                                    <strong>
                                      {entry.scope === "question"
                                        ? `Question ${entry.questionIndex + 1}`
                                        : "Overall result"}
                                    </strong>
                                    <span>
                                      {entry.score} / {entry.maxMarks} marks · {dateText(entry.releasedAt)}
                                    </span>
                                  </div>
                                  {entry.feedback && <p>{entry.feedback}</p>}
                                </article>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                      <span
                        className={`status-pill ${s.gradingStatus === "released" ? "published" : "active"}`}
                      >
                        {s.gradingStatus === "released" ? "graded" : s.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={CheckCircle2}
                  title="No submissions yet"
                  text="Open a published assignment and submit your answer to see it here."
                />
              )}
            </>
          )}

          {tab === "progress" && (
            <>
              <div className="teacher-section-heading">
                <div>
                  <h2>Your learning progress</h2>
                  <p>
                    Insights use released grades only. Private or unreleased
                    marks are not included.
                  </p>
                </div>
              </div>
              <div className="teacher-metrics progress-metrics">
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <Target size={19} />
                  </div>
                  <span>Released results</span>
                  <strong>{progressStats.scored.length}</strong>
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <TrendingUp size={19} />
                  </div>
                  <span>Average score</span>
                  <strong>
                    {progressStats.average === null
                      ? "—"
                      : `${progressStats.average.toFixed(1)}%`}
                  </strong>
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <CheckCircle2 size={19} />
                  </div>
                  <span>Submitted</span>
                  <strong>{submissions.length}</strong>
                </div>
                <div className="teacher-metric">
                  <div className="metric-icon">
                    <BookOpen size={19} />
                  </div>
                  <span>Subjects with results</span>
                  <strong>{progressStats.subjects.length}</strong>
                </div>
              </div>
              {progressStats.scored.length ? (
                <>
                  <section className="student-insight-panel">
                    <div className="teacher-section-heading">
                      <div>
                        <h2>Released result history</h2>
                        <p>
                          Each bar shows the percentage earned on a graded
                          assignment.
                        </p>
                      </div>
                    </div>
                    <div className="student-progress-list">
                      {progressStats.scored
                        .slice()
                        .reverse()
                        .map((s, i) => (
                          <div
                            className="student-progress-row"
                            key={s.id || `${s.assignmentId}-${i}`}
                          >
                            <div className="student-progress-label">
                              <strong>{s.assignmentTitle}</strong>
                              <span>
                                {s.className} ·{" "}
                                {new Date(s.submittedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="student-progress-track">
                              <span style={{ width: `${s.percent}%` }} />
                            </div>
                            <b>{s.percent.toFixed(0)}%</b>
                          </div>
                        ))}
                    </div>
                  </section>
                  <section className="student-insight-panel">
                    <div className="teacher-section-heading">
                      <div>
                        <h2>By subject</h2>
                        <p>
                          Average percentage from released assignment results.
                        </p>
                      </div>
                    </div>
                    {progressStats.subjects.map((subject) => (
                      <div
                        className="student-progress-row"
                        key={subject.subject}
                      >
                        <div className="student-progress-label">
                          <strong>{subject.subject}</strong>
                          <span>
                            {subject.count} graded{" "}
                            {subject.count === 1 ? "result" : "results"}
                          </span>
                        </div>
                        <div className="student-progress-track">
                          <span style={{ width: `${subject.average}%` }} />
                        </div>
                        <b>{subject.average.toFixed(1)}%</b>
                      </div>
                    ))}
                  </section>
                  {progressStats.questions.length > 0 && (
                    <section className="student-insight-panel">
                      <div className="teacher-section-heading">
                        <div>
                          <h2>Question practice areas</h2>
                          <p>
                            Question-level results are shown where your teacher
                            released them.
                          </p>
                        </div>
                      </div>
                      <div className="student-question-insights">
                        {progressStats.questions.map((q) => (
                          <article key={q.label}>
                            <span>{q.label}</span>
                            <strong>{q.percent.toFixed(1)}%</strong>
                            <small>
                              {q.total.toFixed(1)} / {q.max.toFixed(1)} marks
                              across released answers
                            </small>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <Empty
                  icon={TrendingUp}
                  title="Your insights will appear here"
                  text="Complete assignments and check back after your teacher releases results. Unreleased grades stay private."
                />
              )}
              <section className="student-insight-panel">
                <div className="teacher-section-heading">
                  <div>
                    <h2>
                      <Lightbulb
                        size={18}
                        style={{ verticalAlign: "middle", marginRight: 6 }}
                      />
                      Suggested next steps
                    </h2>
                    <p>
                      General study prompts based on the results available to
                      you—not a diagnosis or a guarantee of performance.
                    </p>
                  </div>
                </div>
                <ul className="student-study-tips">
                  {studyTips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </section>
            </>
          )}
          {busy && <p className="student-loading">Loading your workspace…</p>}
        </main>
      </section>
      {activeAssignment && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setActiveAssignment(null);
          }}
        >
          <section
            className="workspace-modal student-submit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
          >
            <header>
              <h2 id="submit-title">{activeAssignment.title}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setActiveAssignment(null)}
              >
                <X size={18} />
              </button>
            </header>
            <p className="student-assignment-meta">
              {activeAssignment.className} · {activeAssignment.classSubject} ·{" "}
              {activeAssignment.totalMarks} marks
            </p>
            <p className="student-assignment-meta">
              Due: {dateText(activeAssignment.dueAt)}
            </p>
            {activeAssignment.attachmentOriginalName && (
              <div className="student-assignment-attachment">
                <div>
                  <strong>Assignment file</strong>
                  <p>{activeAssignment.attachmentOriginalName}</p>
                </div>

                <a
                  className="button button-secondary"
                  href={`${api.defaults.baseURL}/assignments/${activeAssignment.id}/attachment`}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  Download attachment
                </a>
              </div>
            )}
            {activeAssignment.instructions && (
              <div className="student-instructions">
                {activeAssignment.instructions}
              </div>
            )}
            {activeAssignment.questions?.length > 0 && (
              <div className="student-question-list">
                <h3>Assessment questions</h3>
                {activeAssignment.questions.map((q, i) => (
                  <article
                    className="student-question-item"
                    key={`${activeAssignment.id}-q-${i}`}
                  >
                    <div>
                      <strong>Question {i + 1}</strong>
                      <span>{q.marks} marks</span>
                    </div>
                    <p>{q.text}</p>
                    <div className="form-field">
                      <label htmlFor={`student-question-answer-${i}`}>
                        Your answer to question {i + 1}
                      </label>
                      <textarea
                        id={`student-question-answer-${i}`}
                        rows={5}
                        maxLength={20000}
                        value={questionAnswers[i]?.answerText || ""}
                        onChange={(e) =>
                          setQuestionAnswers((old) =>
                            old.map((a, j) =>
                              j === i
                                ? { ...a, answerText: e.target.value }
                                : a,
                            ),
                          )
                        }
                        placeholder="Write your answer here…"
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
            <form onSubmit={submitAnswer}>
              {activeSubmission?.fileName && (
                <div className="student-current-submission">
                  <div>
                    <strong>Previously submitted file</strong>
                    <span>{activeSubmission.fileName}</span>
                    <small>Submitted {dateText(activeSubmission.submittedAt)}</small>
                  </div>
                  <a
                    className="button button-secondary"
                    href={`${api.defaults.baseURL}/submissions/mine/${activeSubmission.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open current file
                  </a>
                </div>
              )}
              <div className="form-field">
                <label htmlFor="assignmentFile">
                  {activeSubmission?.fileName ? "Replace assignment file" : "Upload assignment file"}
                </label>
                <input
                  id="assignmentFile"
                  name="assignmentFile"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (file && file.size > 10 * 1024 * 1024) {
                      event.target.value = "";
                      setSelectedFileName("");
                      setUploadProgress(0);
                      setDisplayProgress(0);
                      setUploadedMB(0);
                      setTotalFileMB(0);
                      setFileError("File size must be 10 MB or less.");
                      return;
                    }

                    setFileError("");
                    setSelectedFileName(file ? file.name : "");
                    setUploadProgress(0);
                    setDisplayProgress(0);
                    setUploadedMB(0);
                    setTotalFileMB(file ? file.size / (1024 * 1024) : 0);
                  }}
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                />

                {selectedFileName && (
                  <div className="selected-file-preview">
                    <div className="selected-file-icon">📄</div>

                    <div className="selected-file-details">
                      <strong>{selectedFileName}</strong>
                      <small>
                        {totalFileMB.toFixed(2)} MB · Ready to submit
                      </small>
                    </div>

                    <span className="selected-file-check">✓</span>
                  </div>
                )}

                <small>
                  Accepted formats: PDF, DOC, DOCX. Maximum size: 10 MB.
                </small>
                {fileError && (
                  <div className="dash-alert error student-file-error" role="alert">
                    {fileError}
                  </div>
                )}
              </div>

              {busy && totalFileMB > 0 && (
                <div className="upload-progress">
                  <div className="upload-progress-heading">
                    <span>Uploading your assignment...</span>
                    <strong>{uploadProgress}%</strong>
                  </div>

                  <div
                    className="upload-progress-track"
                    role="progressbar"
                    aria-label="Assignment upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={displayProgress}
                  >
                    <div
                      className="upload-progress-fill"
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>

                  <small>
                    {uploadedMB.toFixed(2)} MB / {totalFileMB.toFixed(2)} MB
                  </small>
                </div>
              )}

              <p className="modal-note">
                Your file is uploaded when you submit. You can replace it while
                submissions remain open. Your marks and feedback appear after
                your teacher releases the results.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="mini-action"
                  onClick={() => setActiveAssignment(null)}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  <Send size={15} />
                  {submittedByAssignment.has(activeAssignment.id)
                    ? "Update submission"
                    : "Submit answers"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function AssignmentRow({ a, submission, onOpen }) {
  const isPastDue = a.dueAt && Date.parse(a.dueAt) < Date.now();

  const statusLabel = submission
    ? "Submitted"
    : isPastDue
      ? "Overdue"
      : "Active";

  const statusClass = submission
    ? "published"
    : isPastDue
      ? "overdue"
      : "active";
  return (
    <div className="assignment-row">
      <div className="assignment-symbol">
        <ClipboardList size={20} />
      </div>
      <div className="assignment-info">
        <h3>{a.title}</h3>
        <p>
          {a.className} · {a.classSubject} · {a.totalMarks} marks
        </p>
        <p>Due: {dateText(a.dueAt)}</p>
      </div>
      <span className={`status-pill ${statusClass}`}>{statusLabel}</span>

      <div className="assignment-actions">
        <button className="mini-action primary" onClick={() => onOpen(a)}>
          {submission ? "View / edit" : "Open assignment"}
        </button>
      </div>
    </div>
  );
}
function ClassCard({ c, onOpenClass }) {
  return (
    <article
      className="class-card clickable-class-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenClass(c)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenClass(c);
        }
      }}
    >
      {" "}
      <div className="class-card-top">
        <span className="class-symbol">
          <BookOpen size={20} />
        </span>
        <span className="status-pill active">Enrolled</span>
      </div>
      <h3>{c.name}</h3>
      <p>
        {c.subject} · Teacher: {c.teacherName}
      </p>
      {c.description && <p className="class-description">{c.description}</p>}
      <div className="class-stats">
        <span>
          <GraduationCap size={14} /> Your class
        </span>
        <span>Joined {new Date(c.createdAt).toLocaleDateString()}</span>
      </div>
    </article>
  );
}
function Empty({ icon: Icon, title, text }) {
  return (
    <div className="empty-workspace">
      <Icon size={25} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
