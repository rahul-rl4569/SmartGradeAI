import React from "react";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  ShieldCheck,
  Users,
  GraduationCap,
  Mail,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Activity,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Trash2,
} from "lucide-react";
import { API_BASE } from "./apiConfig.js";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 12000,
});
const number = (n) => Number(n || 0).toLocaleString();
export default function AdminDashboard({ user, setUser }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const limit = 25;

  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteBusyUser, setDeleteBusyUser] = useState(null);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function loadOverview() {
    const r = await api.get("/admin/overview");
    setOverview(r.data.overview);
    setLogs(r.data.recentAudit || []);
  }
  async function loadUsers(nextOffset = offset) {
    const r = await api.get("/admin/users", {
      params: { q, role, status, limit, offset: nextOffset },
    });
    setUsers(r.data.users);
    setTotal(r.data.total);
    setOffset(nextOffset);
  }
  async function loadOther() {
    const [a, b] = await Promise.all([
      api.get("/admin/audit-logs", { params: { limit: 50 } }),
      api.get("/admin/email-deliveries", { params: { limit: 50 } }),
    ]);
    setLogs(a.data.logs);
    setEmailLogs(b.data.logs);
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await Promise.all([loadOverview(), loadUsers(offset), loadOther()]);
    } catch (e) {
      setError(
        e.response?.data?.error?.message ||
          "Could not load admin data. Check the API connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (tab === "users") {
      loadUsers(0).catch((e) =>
        setError(e.response?.data?.error?.message || "Could not load users."),
      );
    }
  }, [tab, role, status]);
  async function changeStatus(u) {
    const next = u.status === "active" ? "disabled" : "active";
    if (
      !window.confirm(
        `${next === "disabled" ? "Disable" : "Enable"} ${u.fullName}'s account?`,
      )
    )
      return;
    setError("");
    setNotice("");
    try {
      await api.patch(`/admin/users/${u.id}/status`, { status: next });
      setNotice(`Account ${next}.`);
      await Promise.all([loadUsers(offset), loadOverview(), loadOther()]);
    } catch (e) {
      setError(
        e.response?.data?.error?.message || "Could not update account status.",
      );
    }
  }

  async function deleteAccount(u) {
    const consequences = u.role === "student"
      ? `This also permanently deletes ${u.enrollmentCount || 0} enrollments and ${u.submittedWorkCount || 0} submissions, including their grades and uploaded files.`
      : `This also permanently deletes ${u.ownedClassCount || 0} classes, ${u.ownedAssignmentCount || 0} assignments, and ${u.teachingSubmissionCount || 0} student submissions in those classes, including grades and uploaded files.`;
    if (!window.confirm(`Permanently delete ${u.fullName} (${u.email})? ${consequences} The email can then be used to register again. This cannot be undone.`)) return;
    setError("");
    setNotice("");
    setDeleteBusyUser(u.id);
    try {
      const response = await api.delete(`/admin/users/${u.id}`);
      if (resetUser?.id === u.id) {
        setResetUser(null);
        setNewPassword("");
      }
      setNotice(response.data.fileCleanupFailures
        ? response.data.message
        : `Account deleted. ${u.email} is available for a new registration.`);
      await Promise.all([loadUsers(0), loadOverview(), loadOther()]);
    } catch (e) {
      setError(e.response?.data?.error?.message || "Could not delete the account.");
    } finally {
      setDeleteBusyUser(null);
    }
  }

  async function resetPassword() {
    if (!resetUser) return;

    if (newPassword.length < 14 || newPassword.length > 128) {
      setError("Password must contain between 14 and 128 characters.");
      return;
    }

    if (!window.confirm(`Reset the password for ${resetUser.fullName}?`)) {
      return;
    }

    setError("");
    setNotice("");
    setResetBusy(true);

    try {
      await api.patch(`/admin/users/${resetUser.id}/password`, {
        password: newPassword,
      });

      setNotice(`Password reset successfully for ${resetUser.fullName}.`);
      setResetUser(null);
      setNewPassword("");
      await loadUsers(offset);
      await loadOther();
    } catch (e) {
      setError(
        e.response?.data?.error?.message ||
          "Could not reset the user's password.",
      );
    } finally {
      setResetBusy(false);
    }
  }
  async function generateTeacherCode() {
    const email = teacherEmail.trim().toLowerCase();

    if (!email) {
      setError("Please enter the teacher's email address.");
      return;
    }

    setError("");
    setNotice("");
    setTeacherCode("");
    setCodeBusy(true);

    try {
      const response = await api.post("/auth/admin/teacher-codes", {
        email,
        expiresInDays: 30,
      });

      setTeacherCode(response.data.teacherCode);
      setNotice(`Teacher signup code generated for ${response.data.email}.`);
      setTeacherEmail("");
    } catch (e) {
      setError(
        e.response?.data?.error?.message ||
          "Could not generate the teacher signup code.",
      );
    } finally {
      setCodeBusy(false);
    }
  }
  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  }
  return (
    <div className="teacher-app admin-app">
      <aside className="teacher-sidebar">
        <div className="teacher-side-brand">
          <img
            src="/smartgrade-logo.png"
            alt="SmartGrade AI Logo"
            className="side-logo-image"
          />
          <span>
            SmartGrade <b>AI</b>
            <small>ADMIN CONSOLE</small>
          </span>
        </div>
        <div className="side-section-label">NAVIGATION</div>
        {[
          ["overview", "Dashboard", LayoutDashboard],
          ["users", "Users", Users],
          ["audit", "Audit logs", Activity],
          ["teacher-codes", "Teacher Codes", GraduationCap],
          ["email", "Email delivery", Mail],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            className={`side-nav-item ${tab === key ? "selected" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="teacher-side-bottom">
          <div className="side-user">
            <span className="user-avatar">
              {user.fullName?.slice(0, 1) || "A"}
            </span>
            <span>
              <strong>{user.fullName}</strong>
              <small>Administrator</small>
            </span>
          </div>
          <button className="side-nav-item logout-nav" onClick={logout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      </aside>
      <main className="teacher-main">
        <header className="teacher-topbar">
          <div>
            <div className="section-kicker">
              SMARTGRADE AI · PLATFORM MANAGEMENT
            </div>
            <h1>
              {
                {
                  overview: "Dashboard",
                  users: "User management",
                  audit: "Audit logs",
                  "teacher-codes": "Teacher Code Management",
                  email: "Email delivery",
                }[tab]
              }
            </h1>
          </div>
          <div className="teacher-top-actions">
            <span className="teacher-status">
              <i /> Admin access
            </span>

            <button
              className="mini-action"
              onClick={() => {
                setTab("overview");
                refresh();
              }}
              disabled={busy}
            >
              <RefreshCw size={14} /> {busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>
        <div className="teacher-content">
          {error && (
            <div className="dash-alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="dash-alert success" role="status">
              {notice}
            </div>
          )}
          {tab === "overview" && (
            <>
              <div className="teacher-greeting">
                <div>
                  <div className="section-kicker">
                    GOOD MORNING, {user.fullName?.split(" ")[0]?.toUpperCase()}!
                  </div>
                  <h2>Keep SmartGrade running smoothly.</h2>
                  <p>
                    Review platform activity, account status, and recent system
                    actions.
                  </p>
                </div>
                <div className="dashboard-greeting-actions">
                  <ShieldCheck className="dashboard-greeting-art" />
                  <button
                    type="button"
                    className="button dashboard-greeting-action"
                    onClick={() => setTab("audit")}
                  >
                    View Audit Logs <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div className="dashboard-overview-panels">
                <section className="dashboard-overview-panel">
                  <div className="teacher-section-heading">
                    <div>
                      <h2>Account status</h2>
                      <p>Active and disabled accounts across the platform.</p>
                    </div>
                  </div>
                  <div className="teacher-metrics admin-metrics">
                    <article className="teacher-metric">
                      <div className="metric-icon">
                        <UserCheck size={18} />
                      </div>
                      <span>Active accounts</span>
                      <strong>{number(overview?.users?.active)}</strong>
                    </article>
                    <article className="teacher-metric">
                      <div className="metric-icon">
                        <UserX size={18} />
                      </div>
                      <span>Disabled accounts</span>
                      <strong>{number(overview?.users?.disabled)}</strong>
                    </article>
                    <article className="teacher-metric">
                      <div className="metric-icon">
                        <Mail size={18} />
                      </div>
                      <span>Email failures (30d)</span>
                      <strong>{number(overview?.email?.failed)}</strong>
                    </article>
                  </div>
                </section>
                <section className="dashboard-overview-panel admin-overview-audit">
                  <AuditTable logs={logs.slice(0, 10)} />
                  {logs.length > 10 && (
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => setTab("audit")}
                      style={{ marginTop: 14 }}
                    >
                      Show all audit activity <ChevronRight size={15} />
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "users" && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>Registered accounts</h2>
                  <p>
                    {number(total)} matching users. Administrator accounts are protected. Permanent deletion removes the related class or student records shown in its confirmation.
                  </p>
                </div>
              </div>
              <div className="admin-filters">
                <label className="dash-search">
                  <Search size={16} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name or email"
                    onKeyDown={(e) => e.key === "Enter" && loadUsers(0)}
                  />
                </label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="all">All roles</option>
                  <option value="teacher">Teachers</option>
                  <option value="student">Students</option>
                  <option value="admin">Admins</option>
                </select>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
                <button
                  className="mini-action primary"
                  onClick={() => loadUsers(0)}
                >
                  Search
                </button>
              </div>
              {resetUser && (
                <div className="dash-alert" style={{ marginBottom: "16px" }}>
                  <h3>Reset Password: {resetUser.fullName}</h3>

                  <label>
                    New password
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter a new password (14–128 characters)"
                      minLength={14}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>

                  <div
                    style={{ display: "flex", gap: "8px", marginTop: "12px" }}
                  >
                    <button
                      className="mini-action primary"
                      onClick={resetPassword}
                      disabled={resetBusy}
                    >
                      {resetBusy ? "Resetting..." : "Confirm Reset"}
                    </button>

                    <button
                      className="mini-action"
                      onClick={() => {
                        setResetUser(null);
                        setNewPassword("");
                      }}
                      disabled={resetBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.fullName}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>{u.role}</td>
                        <td>
                          <span className={`status-pill ${u.status}`}>
                            {u.status}
                          </span>
                        </td>
                        <td>
                          {u.createdAt
                            ? new Date(u.createdAt + "Z").toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          {u.role === "admin" ? (
                            <span className="admin-protected">Protected</span>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                className="mini-action"
                                onClick={() => changeStatus(u)}
                              >
                                {u.status === "active" ? (
                                  <>
                                    <UserX size={14} /> Disable
                                  </>
                                ) : (
                                  <>
                                    <UserCheck size={14} /> Enable
                                  </>
                                )}
                              </button>

                              <button
                                className="mini-action"
                                onClick={() => {
                                  setResetUser(u);
                                  setNewPassword("");
                                  setError("");
                                  setNotice("");
                                }}
                              >
                                Reset Password
                              </button>
                              <button
                                className="mini-action danger"
                                onClick={() => deleteAccount(u)}
                                disabled={deleteBusyUser === u.id}
                                title="Permanently delete this account"
                              >
                                <Trash2 size={14} /> {deleteBusyUser === u.id ? "Deleting…" : "Delete account"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!users.length && (
                      <tr>
                        <td colSpan="5">No matching users.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="admin-pagination">
                <span>
                  Showing {users.length ? offset + 1 : 0}–
                  {offset + users.length} of {total}
                </span>
                <button
                  className="mini-action"
                  disabled={offset === 0}
                  onClick={() => loadUsers(Math.max(0, offset - limit))}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  className="mini-action"
                  disabled={offset + limit >= total}
                  onClick={() => loadUsers(offset + limit)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}
          {tab === "audit" && <AuditTable logs={logs} />}
          {tab === "teacher-codes" && (
            <section className="dashboard-section">
              <div className="workspace-toolbar">
                <div>
                  <h2>Generate teacher signup code</h2>
                  <p>
                    Teacher ke email ke liye signup code generate karo. Code 30
                    days mein expire hoga.
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  generateTeacherCode();
                }}
              >
                <label>
                  Teacher email
                  <input
                    type="email"
                    value={teacherEmail}
                    onChange={(e) => setTeacherEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="mini-action primary"
                  disabled={codeBusy}
                >
                  {codeBusy ? "Generating..." : "Generate code"}
                </button>
              </form>

              {teacherCode && (
                <div className="dash-alert success" role="status">
                  <p>Teacher signup code</p>
                  <strong>{teacherCode}</strong>

                  <button
                    type="button"
                    className="mini-action"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(teacherCode)
                        .then(() => setNotice("Teacher code copied."));
                    }}
                  >
                    Copy code
                  </button>
                </div>
              )}
            </section>
          )}
          {tab === "email" && (
            <>
              <div className="workspace-toolbar">
                <div>
                  <h2>Email delivery log</h2>
                  <p>
                    Recent email attempts and delivery status. Error messages
                    may contain provider details.
                  </p>
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Event</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailLogs.map((l) => (
                      <tr key={l.id}>
                        <td>{l.recipientEmail}</td>
                        <td>{l.eventKey}</td>
                        <td>{l.subject}</td>
                        <td>
                          <span className={`status-pill ${l.status}`}>
                            {l.status}
                          </span>
                        </td>
                        <td>{l.createdAt}</td>
                        <td>{l.errorMessage || "—"}</td>
                      </tr>
                    ))}
                    {!emailLogs.length && (
                      <tr>
                        <td colSpan="6">No email delivery records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function AuditTable({ logs = [] }) {
  return (
    <>
      <div className="teacher-section-heading">
        <div>
          <h2>Recent audit activity</h2>
          <p>Security-relevant events recorded by the application.</p>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.actorName || l.actor_name || "System"}
                  <small>{l.actorEmail || l.actor_email || ""}</small>
                </td>
                <td>{l.action}</td>
                <td>
                  {[l.entityType || l.entity_type, l.entityId || l.entity_id]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td>{l.createdAt || l.created_at}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan="4">No audit events recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
