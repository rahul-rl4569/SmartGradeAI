import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../database/db.js";
const fullName = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (
  !fullName ||
  fullName.length < 2 ||
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 14
) {
  console.error(
    "Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 14 characters) in your environment before running this script.",
  );
  process.exit(1);
}
const existing = db
  .prepare("SELECT id,role FROM users WHERE email=?")
  .get(email);
if (existing) {
  console.error(
    existing.role === "admin"
      ? "An admin account already exists for that email."
      : "That email belongs to a non-admin account; choose a separate admin email.",
  );
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
const tx = db.transaction(() => {
  const result = db
    .prepare(
      "INSERT INTO users(full_name,email,password_hash,role,status) VALUES(?,?,?,'admin','active')",
    )
    .run(fullName, email, hash);
  db.prepare(
    "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?)",
  ).run(
    result.lastInsertRowid,
    "admin.bootstrap",
    "user",
    String(result.lastInsertRowid),
    JSON.stringify({ source: "createAdmin script" }),
  );
  return result.lastInsertRowid;
});
const id = tx();
console.log(
  `Administrator account created (user ID ${id}, email ${email}). Remove ADMIN_PASSWORD from the shell environment now.`,
);
db.close();
