import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../database/db.js";

export function requireAuth(req, res, next) {
  const token = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (!token)
    return res.status(401).json({
      error: { code: "AUTH_REQUIRED", message: "Please log in to continue." },
    });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: "smartgrade-ai",
      audience: "smartgrade-ai-web",
    });
    const user = db
      .prepare(
        "SELECT id, full_name, email, role, status, token_version FROM users WHERE id = ?",
      )
      .get(payload.sub);
    if (!user || user.status !== "active" || user.token_version !== payload.ver)
      throw new Error("Session invalid");
    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    res.clearCookie(env.AUTH_COOKIE_NAME, clearCookieOptions());
    return res.status(401).json({
      error: {
        code: "INVALID_SESSION",
        message: "Your session has expired. Please log in again.",
      },
    });
  }
}
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to access this resource.",
        },
      });
    next();
  };
}
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
}
export function clearCookieOptions() {
  const options = { ...cookieOptions() };
  delete options.maxAge;
  return options;
}
export function issueSession(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), ver: user.token_version, role: user.role },
    env.JWT_SECRET,
    {
      expiresIn: env.SESSION_TTL,
      issuer: "smartgrade-ai",
      audience: "smartgrade-ai-web",
    },
  );
  res.cookie(env.AUTH_COOKIE_NAME, token, cookieOptions());
}
