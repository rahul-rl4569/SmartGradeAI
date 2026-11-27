import React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowRight,
  BookOpenCheck,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
  Users,
  FileCheck2,
  Target,
  Lightbulb,
  Mail,
  Send,
  Eye,
  EyeOff,
  LockKeyhole,
  UserRound,
  LogOut,
} from "lucide-react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import TeacherDashboard from "./TeacherDashboard.jsx";
import StudentDashboard from "./StudentDashboard.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import { API_BASE } from "./apiConfig.js";

const features = [
  {
    icon: ClipboardCheck,
    title: "AI-assisted evaluation",
    text: "Review structured, question-by-question grading suggestions instead of starting every evaluation from scratch.",
  },
  {
    icon: BookOpenCheck,
    title: "Teacher-approved rubrics",
    text: "Create, refine, and approve clear assessment criteria before they are used to evaluate student work.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Learning insights",
    text: "Use assessment results to understand class trends, identify learning gaps, and plan next steps.",
  },
  {
    icon: FileCheck2,
    title: "Question paper workflow",
    text: "Organize question papers and review extracted questions before they become part of an assignment.",
  },
  {
    icon: Users,
    title: "Connected classroom",
    text: "Keep classes, assignments, submissions, feedback, and teacher review in one planned workflow.",
  },
  {
    icon: ShieldCheck,
    title: "Human oversight",
    text: "AI suggestions remain reviewable. Teachers retain control over edits, approvals, and released grades.",
  },
];
const workflow = [
  [
    "01",
    "Create a class",
    "Teachers set up a class and invite students to join.",
  ],
  [
    "02",
    "Prepare an assignment",
    "Add instructions, a question paper, due date, and total marks.",
  ],
  [
    "03",
    "Review questions and rubric",
    "AI assistance can suggest extracted questions and rubric criteria for teacher approval.",
  ],
  [
    "04",
    "Collect student answers",
    "Students view published work and submit their responses.",
  ],
  [
    "05",
    "Evaluate with AI assistance",
    "The evaluation service proposes marks and feedback against the approved rubric.",
  ],
  [
    "06",
    "Review and release",
    "Teachers inspect, edit, and approve results before students can view them.",
  ],
];

const authApi = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    authApi
      .get("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const value = {
    user,
    loading,
    async refresh() {
      const r = await authApi.get("/auth/me");
      setUser(r.data.user);
      return r.data.user;
    },
    setUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() {
  return useContext(AuthContext);
}
function AuthFrame({ eyebrow, title, description, children, variant = "" }) {
  return (
    <Layout>
      <main
        className={`auth-page section-wrap${variant ? ` auth-page-${variant}` : ""}`}
      >
        <section
          className={`auth-card${variant ? ` auth-card-${variant}` : ""}`}
        >
          <div className="auth-brand-mark">
            <ShieldCheck size={24} />
          </div>
          <div className="section-kicker">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
      </main>
    </Layout>
  );
}
function AuthAlert({ message, type = "error" }) {
  return message ? (
    <div className={`form-alert ${type}`} role="status">
      <ShieldCheck size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
function AuthField({
  label,
  name,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  required = true,
  minLength,
  maxLength,
  suffix,
}) {
  return (
    <div className="form-field">
      <label htmlFor={`auth-${name}`}>{label}</label>
      <div className="auth-input-wrap">
        <input
          id={`auth-${name}`}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
        />
        {suffix}
      </div>
    </div>
  );
}
function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  if (!loading && user)
    return (
      <Navigate
        to={
          user.role === "student"
            ? "/student/dashboard"
            : user.role === "admin"
              ? "/admin/dashboard"
              : "/teacher/dashboard"
        }
        replace
      />
    );
  const update = (e) =>
    setForm((v) => ({ ...v, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authApi.post("/auth/login", form);
      setUser(r.data.user);
      navigate(
        r.data.user.role === "student"
          ? "/student/dashboard"
          : r.data.user.role === "admin"
            ? "/admin/dashboard"
            : "/teacher/dashboard",
        { replace: true },
      );
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Could not connect to SmartGrade AI. Check that the backend is running.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      variant="login"
      eyebrow="WELCOME BACK"
      title="Log in to SmartGrade AI"
      description="Access your classroom workspace and assessment tools."
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthAlert message={error} />
        <AuthField
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          onChange={update}
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
        />
        <p className="email-helper">
          Use your college email or any personal email address.
        </p>
        <AuthField
          label="Password"
          name="password"
          type={show ? "text" : "password"}
          value={form.password}
          onChange={update}
          autoComplete="current-password"
          placeholder="Enter your password"
          suffix={
            <button
              type="button"
              className="password-toggle"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          }
        />
        <div className="auth-form-meta">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button
          className="button contact-submit"
          disabled={busy || !form.email || !form.password}
        >
          {busy ? "Logging in…" : "Log in"} <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          New to SmartGrade AI? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </AuthFrame>
  );
}
function SignupPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "teacher",
    rollNumber: "",
    teacherCode: "",
    termsAccepted: false,
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const { user, setUser, loading } = useAuth();
  const navigate = useNavigate();
  if (!loading && user && !recoveryCode)
    return (
      <Navigate
        to={
          user.role === "student"
            ? "/student/dashboard"
            : user.role === "admin"
              ? "/admin/dashboard"
              : "/teacher/dashboard"
        }
        replace
      />
    );
  const update = (e) =>
    setForm((v) => ({
      ...v,
      [e.target.name]:
        e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authApi.post("/auth/signup", form);
      console.log("SIGNUP RESPONSE:", r.data);
      setRecoveryCode(r.data.recoveryCode);
      setUser(r.data.user);
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Could not create your account. Check that the backend is running.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      variant="signup"
      eyebrow="GET STARTED"
      title="Create your account"
      description="Set up a teacher or student account to begin. Administrator accounts cannot be created publicly."
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthAlert message={error} />
        <AuthField
          label="Full name"
          name="fullName"
          value={form.fullName}
          onChange={update}
          autoComplete="name"
          placeholder="Your full name"
          minLength={2}
          maxLength={120}
        />
        <AuthField
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          onChange={update}
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
        />
        <p className="email-helper">
          Use your college email or any personal email address.
        </p>
        <AuthField
          label="Password (at least 10 characters)"
          name="password"
          type={show ? "text" : "password"}
          value={form.password}
          onChange={update}
          autoComplete="new-password"
          placeholder="Create a strong password"
          minLength={10}
          maxLength={128}
          suffix={
            <button
              type="button"
              className="password-toggle"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          }
        />
        <div className="form-field">
          <label htmlFor="auth-role">I am joining as</label>
          <select
            id="auth-role"
            name="role"
            value={form.role}
            onChange={update}
          >
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </div>
        {form.role === "student" && (
          <AuthField
            label="Roll number"
            name="rollNumber"
            value={form.rollNumber}
            onChange={update}
            placeholder="Enter your roll number"
            maxLength={50}
          />
        )}

        {form.role === "teacher" && (
          <AuthField
            label="Teacher code"
            name="teacherCode"
            value={form.teacherCode}
            onChange={update}
            placeholder="Enter the code provided by your admin"
            maxLength={50}
          />
        )}
        <label className="terms-row">
          <input
            type="checkbox"
            name="termsAccepted"
            checked={form.termsAccepted}
            onChange={update}
            required
          />
          <span>
            I agree to the terms of use and understand that AI grading
            suggestions require teacher review.
          </span>
        </label>
        <button
          className="button contact-submit"
          disabled={busy || !form.termsAccepted}
        >
          {busy ? "Creating account…" : "Create account"}{" "}
          <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>

        {recoveryCode && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#fff",
                padding: "24px",
                borderRadius: "12px",
                width: "100%",
                maxWidth: "380px",
                textAlign: "center",
                boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h3>Save Your Recovery Code</h3>
              <p>
                Save this code safely. You may need it if you forget your
                password.
              </p>
              <div
                style={{
                  padding: "12px",
                  margin: "16px 0",
                  background: "#f3f4f6",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  overflowWrap: "anywhere",
                }}
              >
                {recoveryCode}
              </div>

              <button
                type="button"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#198754",
                  border: "1px solid #198754",
                  cursor: "pointer",
                }}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recoveryCode);
                  } catch (error) {
                    console.error("Could not copy recovery code:", error);
                  }
                }}
              >
                Copy Code
              </button>

              <button
                type="button"
                className="button contact-submit"
                style={{ marginTop: "10px" }}
                onClick={() => {
                  navigate(
                    user?.role === "student"
                      ? "/student/dashboard"
                      : user?.role === "admin"
                        ? "/admin/dashboard"
                        : "/teacher/dashboard",
                    { replace: true },
                  );
                }}
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        )}
      </form>
    </AuthFrame>
  );
}
function ForgotPasswordPage() {
  const [form, setForm] = useState({
    email: "",
    recoveryCode: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const r = await authApi.post("/auth/reset-password-with-recovery", form);

      setSuccess(r.data.message);
      setForm((current) => ({
        ...current,
        recoveryCode: "",
        password: "",
      }));
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Could not contact the server. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password"
      description="Enter your registered email, your original recovery code, and your new password."
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthAlert message={error} />

        {success && (
          <div className="form-alert success" role="status">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        )}

        <AuthField
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
        />

        <AuthField
          label="Recovery code"
          name="recoveryCode"
          value={form.recoveryCode}
          onChange={(e) => setForm({ ...form, recoveryCode: e.target.value })}
          placeholder="SGAI-XXXX-XXXX-XXXX"
          maxLength={50}
        />

        <AuthField
          label="New password"
          name="password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete="new-password"
          placeholder="At least 10 characters"
          maxLength={128}
        />

        <button
          className="button contact-submit"
          disabled={
            busy ||
            !form.email ||
            !form.recoveryCode ||
            form.password.length < 10
          }
        >
          {busy ? "Resetting…" : "Reset password"}
          <ArrowRight size={16} />
        </button>

        {success && (
          <p className="auth-switch">
            <Link to="/login">Go to login</Link>
          </p>
        )}

        {!success && (
          <p className="auth-switch">
            <Link to="/login">Return to login</Link>
          </p>
        )}
      </form>
    </AuthFrame>
  );
}
function ResetPasswordPage() {
  const query = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(query.get("token") || "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await authApi.post("/auth/reset-password", { token, password });
      setSuccess(r.data.message);
      setTimeout(() => navigate("/login", { replace: true }), 1000);
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "Could not reset password. Request a new token.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      eyebrow="SECURE YOUR ACCOUNT"
      title="Choose a new password"
      description="Use the single-use reset token and choose a password with at least 10 characters."
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthAlert message={error} />
        <AuthAlert message={success} type="success" />
        <AuthField
          label="Reset token"
          name="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          placeholder="Paste reset token"
          minLength={32}
        />
        <AuthField
          label="New password"
          name="password"
          type={show ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 10 characters"
          minLength={10}
          maxLength={128}
          suffix={
            <button
              type="button"
              className="password-toggle"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          }
        />
        <button
          className="button contact-submit"
          disabled={busy || token.length < 32 || password.length < 10}
        >
          {busy ? "Updating…" : "Update password"} <ArrowRight size={16} />
        </button>
        <p className="auth-switch">
          <Link to="/login">Return to login</Link>
        </p>
      </form>
    </AuthFrame>
  );
}
function ProtectedDashboard({ role }) {
  const { user, loading, setUser } = useAuth();
  const [error, setError] = useState("");
  if (loading)
    return (
      <main className="auth-page section-wrap">
        <p>Checking your session…</p>
      </main>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role)
    return (
      <Navigate
        to={
          user.role === "student"
            ? "/student/dashboard"
            : user.role === "admin"
              ? "/admin/dashboard"
              : "/teacher/dashboard"
        }
        replace
      />
    );
  async function logout() {
    try {
      await authApi.post("/auth/logout");
    } catch {}
    setUser(null);
  }
  if (role === "teacher")
    return <TeacherDashboard user={user} setUser={setUser} />;

  if (role === "admin") return <AdminDashboard user={user} setUser={setUser} />;
  return <StudentDashboard user={user} setUser={setUser} />;
}

function Brand({ footer = false }) {
  return (
    <Link
      className={`brand ${footer ? "footer-brand" : ""}`}
      to="/"
      aria-label="SmartGrade AI home"
    >
      <span className="logo-frame">
        <img src="/smartgrade-logo.png" alt="SmartGrade AI Logo" />{" "}
      </span>
      <span>
        SmartGrade <b>AI</b>
      </span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = () => setOpen(false);
  const links = [
    ["Home", "/"],
    ["About", "/about"],
    ["Features", "/features"],
    ["How it works", "/how-it-works"],
    ["Contact", "/contact"],
  ];
  return (
    <header className="topbar">
      <Brand />
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={21} /> : <Menu size={21} />}
      </button>
      <nav
        className={`nav-links ${open ? "nav-open" : ""}`}
        aria-label="Main navigation"
      >
        {links.map(([label, to]) => (
          <NavLink
            key={to}
            to={to}
            onClick={close}
            className={({ isActive }) =>
              isActive && location.pathname !== "/" ? "active" : ""
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="nav-actions">
        <Link className="login-link" to="/login">
          Log in
        </Link>

        <Link className="button button-small" to="/signup">
          Get started <ArrowRight size={16} />
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <Brand footer />
      <span>Thoughtful assessment. Teacher-led decisions.</span>
      <span>© {new Date().getFullYear()} SmartGrade AI</span>
    </footer>
  );
}

function Layout({ children, home = false }) {
  return (
    <div className={`site-shell${home ? " home-shell" : ""}`}>
      <Header />
      {children}
      <Footer />
    </div>
  );
}
function PageIntro({ eyebrow, title, text }) {
  return (
    <section className="page-intro section-wrap">
      <div className="section-kicker">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  );
}
function FeatureGrid({ items = features }) {
  return (
    <div className="feature-grid">
      {items.map(({ icon: Icon, title, text }) => (
        <article className="feature-card" key={title}>
          <div className="feature-icon">
            <Icon size={22} />
          </div>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}
function HomePage() {
  return (
    <Layout home>
      {" "}
      <main id="home">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={15} /> TEACHER-LED. AI-ASSISTED.
            </div>
            <h1>
              Better feedback.
              <br />
              <span>More room to teach.</span>
            </h1>
            <p className="hero-description">
              SmartGrade AI helps educators organize assignments, review
              AI-assisted evaluations, and turn assessment results into
              meaningful learning steps.
            </p>
            <div className="hero-actions">
              <Link className="button" to="/signup">
                Get started <ArrowRight size={17} />
              </Link>
              <Link className="button button-secondary" to="/features">
                Explore features
              </Link>
            </div>
            <div className="trust-note">
              <ShieldCheck size={17} />
              <span>
                Teacher approval stays at the heart of every final grade.
              </span>
            </div>
          </div>
          <div
            className="preview-card"
            aria-label="Illustrative assessment dashboard preview"
          >
            <div className="preview-head">
              <div>
                <span className="status-dot" />{" "}
                <span className="preview-label">ASSESSMENT OVERVIEW</span>
              </div>
              <span className="preview-tag">Illustrative preview</span>
            </div>
            <h3>Biology · Cell Structure</h3>
            <p className="muted">Assignment review workspace</p>
            <div className="metric-row">
              <div className="metric">
                <span>Submissions</span>
                <strong>24</strong>
                <small>Example only</small>
              </div>
              <div className="metric green-metric">
                <span>Rubric</span>
                <strong>Approved</strong>
                <small>Teacher reviewed</small>
              </div>
            </div>
            <div className="review-line">
              <div className="avatar">AI</div>
              <div className="review-copy">
                <strong>Evaluation suggestions</strong>
                <span>Question-by-question feedback</span>
              </div>
              <span className="review-pill">Review</span>
            </div>
            <div className="progress-label">
              <span>Review progress</span>
              <span>Teacher controlled</span>
            </div>
            <div className="progress-track">
              <span />
            </div>
            <div className="preview-foot">
              <ShieldCheck size={16} /> Suggested marks are not released until
              approved.
            </div>
          </div>
        </section>
        <section className="feature-band">
          <div className="section-wrap feature-band-inner">
            <span>BUILT FOR REAL CLASSROOM WORKFLOWS</span>
            <div>
              <span>
                <GraduationCap size={18} /> For educators
              </span>
              <span>
                <ShieldCheck size={18} /> Human oversight
              </span>
              <span>
                <ChartNoAxesCombined size={18} /> Actionable insights
              </span>
            </div>
          </div>
        </section>
        <section className="section-wrap content-section" id="about">
          <div className="section-kicker">ASSESSMENT, WITH PURPOSE</div>
          <h2>
            Spend less time on repetitive work.
            <br />
            Keep the judgment where it belongs.
          </h2>
          <p className="section-intro">
            SmartGrade AI brings class management, submissions, rubric-guided
            evaluation, and reporting into one connected workflow—while
            educators remain responsible for final grades.
          </p>
          <Link className="text-link" to="/about">
            Learn about our approach <ArrowRight size={15} />
          </Link>
        </section>
        <section className="section-wrap feature-section" id="features">
          <div className="section-heading">
            <div>
              <div className="section-kicker">ONE CONNECTED WORKSPACE</div>
              <h2>Tools that support better teaching</h2>
            </div>
            <p>
              From setting the assignment to reviewing learning gaps, keep the
              process clear and accountable.
            </p>
          </div>
          <FeatureGrid items={features.slice(0, 3)} />
          <div className="center-link">
            <Link className="text-link" to="/features">
              Explore all features <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section className="workflow-section" id="how-it-works">
          <div className="section-wrap workflow-inner">
            <div>
              <div className="section-kicker">HOW IT WORKS</div>
              <h2>From assignment to insight.</h2>
              <p>
                Each stage connects to the next, with teacher review built into
                the evaluation process.
              </p>
              <Link className="text-link" to="/how-it-works">
                View the complete workflow <ArrowRight size={15} />
              </Link>
            </div>
            <ol className="steps">
              {workflow.slice(0, 3).map(([n, title, text]) => (
                <li key={n}>
                  <span>{n}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="section-wrap cta-section">
          <div>
            <div className="section-kicker">A CLEARER ASSESSMENT WORKFLOW</div>
            <h2>Make room for meaningful feedback.</h2>
            <p>
              SmartGrade AI is being built around educators, students, and
              responsible AI assistance.
            </p>
          </div>
          <Link className="button" to="/contact">
            Contact the team <ArrowRight size={17} />
          </Link>
        </section>
      </main>
    </Layout>
  );
}
function AboutPage() {
  return (
    <Layout home>
      <main>
        <PageIntro
          eyebrow="ABOUT SMARTGRADE AI"
          title={
            <>
              Assessment support that keeps <span>teachers in control.</span>
            </>
          }
          text="SmartGrade AI is designed to connect assignment preparation, student submissions, rubric-guided evaluation, feedback, and reporting in a single educational workflow."
        />
        <section className="section-wrap split-story">
          <article>
            <div className="feature-icon">
              <Target size={22} />
            </div>
            <h2>The problem we're addressing</h2>
            <p>
              Assessment often involves repeated administrative tasks:
              organizing assignments, reviewing answers, applying criteria
              consistently, and preparing feedback. SmartGrade AI is being
              designed to support this work while keeping assessment decisions
              transparent and educator-led.
            </p>
          </article>
          <article>
            <div className="feature-icon">
              <Lightbulb size={22} />
            </div>
            <h2>Our product vision</h2>
            <p>
              Bring classroom workflows together so teachers can spend more
              attention on understanding student work and planning useful next
              steps. The platform is intended to support—not
              replace—professional judgment.
            </p>
          </article>
        </section>
        <section className="workflow-section">
          <div className="section-wrap">
            <div className="section-kicker">
              DESIGNED FOR BOTH SIDES OF LEARNING
            </div>
            <h2 className="section-title">
              A shared workflow, different needs.
            </h2>
            <div className="two-card-grid">
              <article className="feature-card">
                <div className="feature-icon">
                  <GraduationCap size={22} />
                </div>
                <h3>For teachers</h3>
                <p>
                  Organize classes, prepare assignments, approve rubrics, review
                  evaluation suggestions, adjust marks, and release feedback
                  with oversight.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">
                  <BookOpenCheck size={22} />
                </div>
                <h3>For students</h3>
                <p>
                  Access published assignments, submit answers, and—when results
                  are released—review marks and constructive feedback.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="section-wrap ethics-callout">
          <ShieldCheck size={26} />
          <div>
            <h2>Responsible AI and human oversight</h2>
            <p>
              AI-generated questions, rubrics, marks, and feedback are
              suggestions that need appropriate review. Teachers retain final
              grading authority, and students should receive only results that
              have been approved and released.
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
function FeaturesPage() {
  return (
    <Layout home>
      <main>
        <PageIntro
          eyebrow="PLATFORM FEATURES"
          title={
            <>
              One connected workspace for <span>assessment and feedback.</span>
            </>
          }
          text="Explore the core capabilities planned for SmartGrade AI. Availability depends on the implementation phase; account and assessment workflows will be activated as they are completed and tested."
        />
        <section className="section-wrap full-feature-section">
          <FeatureGrid />
          <div className="feature-note">
            <ShieldCheck size={20} />
            <p>
              <strong>Teacher approval is a core workflow rule.</strong>
              <br />
              AI suggestions are not final grades. The intended workflow
              includes teacher review and explicit approval before results are
              released.
            </p>
          </div>
        </section>
        <section className="workflow-section">
          <div className="section-wrap workflow-inner">
            <div>
              <div className="section-kicker">BUILT AROUND YOUR WORKFLOW</div>
              <h2>Connected steps, clear decisions.</h2>
              <p>
                Each capability is intended to connect to the next, instead of
                becoming an isolated tool.
              </p>
            </div>
            <div className="feature-mini-list">
              <p>
                <CheckCircle2 /> Class and assignment organization
              </p>
              <p>
                <CheckCircle2 /> Questions and rubric review
              </p>
              <p>
                <CheckCircle2 /> Student submissions and evaluation
              </p>
              <p>
                <CheckCircle2 /> Teacher approval and reporting
              </p>
            </div>
          </div>
        </section>
        <section className="section-wrap cta-section">
          <div>
            <div className="section-kicker">HAVE A QUESTION?</div>
            <h2>Let's talk about your workflow.</h2>
            <p>Send a message through the contact form.</p>
          </div>
          <Link className="button" to="/contact">
            Contact us <ArrowRight size={17} />
          </Link>
        </section>
      </main>
    </Layout>
  );
}
function HowItWorksPage() {
  return (
    <Layout home>
      <main>
        <PageIntro
          eyebrow="HOW IT WORKS"
          title={
            <>
              From question paper to <span>actionable feedback.</span>
            </>
          }
          text="SmartGrade AI is organized around a reviewable workflow. Teachers prepare the assessment, students submit their work, and AI-assisted evaluation remains subject to teacher approval."
        />
        <section className="section-wrap timeline-section">
          <ol className="timeline">
            {workflow.map(([n, title, text], i) => (
              <li key={n}>
                <span className="timeline-number">{n}</span>
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                  {i === 2 && (
                    <small>
                      AI suggestions must be reviewed and approved before
                      publication.
                    </small>
                  )}
                  {i === 4 && (
                    <small>
                      Missing or uncertain answers should be flagged for human
                      review.
                    </small>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="workflow-section">
          <div className="section-wrap workflow-inner">
            <div>
              <div className="section-kicker">A NON-NEGOTIABLE PRINCIPLE</div>
              <h2>AI assists. Teachers decide.</h2>
              <p>
                The system is intended to make evaluation more organized without
                removing educator accountability.
              </p>
            </div>
            <div className="principle-card">
              <ShieldCheck size={28} />
              <strong>No automatic grade release</strong>
              <p>
                Proposed marks are reviewed and approved by the teacher before
                students can see their results.
              </p>
            </div>
          </div>
        </section>
        <section className="section-wrap cta-section">
          <div>
            <div className="section-kicker">NEXT STEP</div>
            <h2>Questions about SmartGrade AI?</h2>
            <p>Send a message to the team.</p>
          </div>
          <Link className="button" to="/contact">
            Contact us <ArrowRight size={17} />
          </Link>
        </section>
      </main>
    </Layout>
  );
}
function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [state, setState] = useState({ status: "idle", message: "" });
  const update = (e) =>
    setForm((old) => ({ ...old, [e.target.name]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setState({ status: "loading", message: "" });
    try {
      const response = await axios.post(`${API_BASE}/contact`, form, {
        headers: { "Content-Type": "application/json" },
        timeout: 12000,
      });
      setState({
        status: "success",
        message: response.data.message || "Your message has been received.",
      });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      const message =
        error.response?.data?.error?.message ||
        (error.code === "ECONNABORTED"
          ? "The request timed out. Please try again."
          : "We could not send your message. Check that the API server is running, then try again.");
      setState({ status: "error", message });
    }
  }
  return (
    <Layout home>
      <main>
        <PageIntro
          eyebrow="CONTACT"
          title={
            <>
              Tell us what you <span>would like to know.</span>
            </>
          }
          text="Use this form to send a question or share feedback about SmartGrade AI. Required fields are marked below."
        />
        <section className="section-wrap contact-layout">
          <aside className="contact-aside">
            <div className="feature-icon">
              <Mail size={22} />
            </div>
            <h2>Get in touch</h2>
            <p>
              Send your message using the form. Your request is stored so it can
              be followed up by the team when contact management is available.
            </p>
            <div className="contact-assurance">
              <ShieldCheck size={19} />
              <span>
                Only submit information needed to respond to your request.
              </span>
            </div>
            <div className="contact-steps">
              <div>
                <span>01</span>
                <p>Tell us how to reach you.</p>
              </div>
              <div>
                <span>02</span>
                <p>Describe your question or request.</p>
              </div>
              <div>
                <span>03</span>
                <p>Submit the form for processing.</p>
              </div>
            </div>
          </aside>
          <form className="contact-form" onSubmit={submit} noValidate>
            {state.message && (
              <div className={`form-alert ${state.status}`} role="status">
                {state.status === "success" ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
                <span>{state.message}</span>
              </div>
            )}
            <div className="form-field">
              <label htmlFor="contact-name">
                Full name <span>*</span>
              </label>
              <input
                id="contact-name"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update}
                minLength={2}
                maxLength={120}
                required
                placeholder="Your name"
              />
            </div>
            <div className="form-field">
              <label htmlFor="contact-email">
                Email address <span>*</span>
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={update}
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="form-field">
              <label htmlFor="contact-subject">
                Subject <span>*</span>
              </label>
              <input
                id="contact-subject"
                name="subject"
                value={form.subject}
                onChange={update}
                minLength={2}
                maxLength={160}
                required
                placeholder="What is your message about?"
              />
            </div>
            <div className="form-field">
              <label htmlFor="contact-message">
                Message <span>*</span>
              </label>
              <textarea
                id="contact-message"
                name="message"
                value={form.message}
                onChange={update}
                minLength={5}
                maxLength={5000}
                required
                rows={5}
                placeholder="Write your message here..."
              />
              <div className="character-count">{form.message.length}/5000</div>
            </div>
            <button
              className="button contact-submit"
              type="submit"
              disabled={state.status === "loading"}
            >
              {state.status === "loading" ? "Sending message…" : "Send message"}{" "}
              <Send size={16} />
            </button>
            <p className="form-footnote">
              Do not include passwords, payment details, or sensitive student
              records.
            </p>
          </form>
        </section>
      </main>
    </Layout>
  );
}
function InfoPage({ title, text }) {
  return (
    <Layout>
      <main className="section-wrap unavailable-page">
        <div className="feature-icon">
          <ShieldCheck size={22} />
        </div>
        <div className="section-kicker">SMARTGRADE AI · DEVELOPMENT</div>
        <h1>{title}</h1>
        <p>{text}</p>
        <Link className="button" to="/">
          Return to homepage <ArrowRight size={16} />
        </Link>
      </main>
    </Layout>
  );
}
function NotFoundPage() {
  return (
    <InfoPage
      title="Page not found"
      text="The page you requested does not exist. Use the navigation to return to a SmartGrade AI page."
    />
  );
}
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />{" "}
        <Route path="/about" element={<AboutPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/teacher/dashboard"
          element={<ProtectedDashboard role="teacher" />}
        />
        <Route
          path="/student/dashboard"
          element={<ProtectedDashboard role="student" />}
        />
        <Route
          path="/admin/dashboard"
          element={<ProtectedDashboard role="admin" />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
