import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { db } from "../src/database/db.js";

const teacherSignupFixtures = [];

async function signup(base, role, label) {
  const email = `${label}-${randomUUID()}@example.test`;
  let teacherCode = "";
  if (role === "teacher") {
    teacherCode = `TCH-${randomUUID()}`;
    const admin = db
      .prepare(
        "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,'admin')",
      )
      .run("Phase Four Test Admin", `${label}-admin-${randomUUID()}@example.test`, "test-password-hash");
    const teacherCodeRow = db.prepare(
      `INSERT INTO teacher_signup_codes(teacher_code_hash,teacher_email,created_by,expires_at)
       VALUES(?,?,?,?)`,
    ).run(
      createHash("sha256").update(teacherCode).digest("hex"),
      email,
      admin.lastInsertRowid,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );
    teacherSignupFixtures.push({
      adminId: admin.lastInsertRowid,
      codeId: teacherCodeRow.lastInsertRowid,
    });
  }
  const response = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({
      fullName: `Phase Four ${role}`,
      email,
      password: "SafePassword!123",
      role,
      ...(role === "student" ? { rollNumber: `ROLL-${randomUUID()}` } : {}),
      ...(teacherCode ? { teacherCode } : {}),
      termsAccepted: true,
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return {
    user: (await response.json()).user,
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}

async function request(base, path, cookie, method = "GET", body) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body
        ? {
            "content-type": "application/json",
            origin: "http://127.0.0.1:5173",
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("Phase 4 class, enrollment, assignment, publication and ownership workflow", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let teacher, student, classId;
  try {
    teacher = await signup(base, "teacher", "phase4teacher");
    student = await signup(base, "student", "phase4student");

    let response = await request(base, "/classes", teacher.cookie, "POST", {
      name: "Biology 101",
      subject: "Biology",
      description: "Cell structure",
    });
    assert.equal(response.status, 201, await response.clone().text());
    let data = await response.json();
    classId = data.class.id;
    assert.ok(data.class.enrollmentCode);
    assert.equal(data.class.studentCount, 0);

    response = await request(base, "/classes", student.cookie, "POST", {
      name: "Nope",
      subject: "Nope",
    });
    assert.equal(response.status, 403);

    response = await request(
      base,
      "/enrollments/join",
      student.cookie,
      "POST",
      { enrollmentCode: data.class.enrollmentCode.toLowerCase() },
    );
    assert.equal(response.status, 201, await response.clone().text());
    response = await request(
      base,
      "/enrollments/join",
      student.cookie,
      "POST",
      { enrollmentCode: data.class.enrollmentCode },
    );
    assert.equal(response.status, 409);

    response = await request(base, "/assignments", teacher.cookie, "POST", {
      classId,
      title: "Cell worksheet",
      instructions: "Answer all questions.",
      totalMarks: 20,
    });
    assert.equal(response.status, 201, await response.clone().text());
    data = await response.json();
    const assignmentId = data.assignment.id;

    response = await request(
      base,
      `/assignments/${assignmentId}`,
      student.cookie,
    );
    assert.equal(
      response.status,
      403,
      "students must not see draft assignments",
    );

    response = await request(
      base,
      `/assignments/${assignmentId}/publish`,
      teacher.cookie,
      "POST",
      {},
    );
    assert.equal(response.status, 200, await response.clone().text());
    response = await request(
      base,
      `/assignments/${assignmentId}`,
      student.cookie,
    );
    assert.equal(response.status, 200);
    data = await response.json();
    assert.equal(data.assignment.title, "Cell worksheet");
    assert.equal("teacherId" in data.assignment, false);

    const otherTeacher = await signup(base, "teacher", "phase4otherteacher");
    response = await request(base, `/classes/${classId}`, otherTeacher.cookie);
    assert.equal(response.status, 403);

    response = await request(
      base,
      `/classes/${classId}/enrollments`,
      teacher.cookie,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).students.length, 1);
  } finally {
    for (const fixture of teacherSignupFixtures.splice(0)) {
      db.prepare("DELETE FROM teacher_signup_codes WHERE id=?").run(fixture.codeId);
      db.prepare("DELETE FROM users WHERE id=?").run(fixture.adminId);
    }
    if (classId) db.prepare("DELETE FROM classes WHERE id=?").run(classId);
    if (teacher?.user?.id)
      db.prepare("DELETE FROM users WHERE id=?").run(teacher.user.id);
    if (student?.user?.id)
      db.prepare("DELETE FROM users WHERE id=?").run(student.user.id);
    // Remove any additional test users created with the phase4otherteacher label.
    db.prepare(
      "DELETE FROM users WHERE email LIKE 'phase4otherteacher-%@example.test'",
    ).run();
  }
});
