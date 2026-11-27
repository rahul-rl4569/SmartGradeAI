import { env } from "./env.js";

const localDevelopmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export const allowedClientOrigins = new Set([
  new URL(env.CLIENT_URL).origin,
  "https://smart-grade-ai-p1.vercel.app",
  ...localDevelopmentOrigins,
]);

export function isAllowedClientOrigin(origin) {
  return allowedClientOrigins.has(origin);
}
