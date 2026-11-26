import { Router } from "express";
import { databaseReady } from "../database/db.js";

const startedAt = Date.now();
const router = Router();
router.get("/", (_req, res) => {
  let database = "ready";
  try {
    if (!databaseReady()) database = "unavailable";
  } catch {
    database = "unavailable";
  }
  const ok = database === "ready";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    service: "smartgrade-ai-api",
    database,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});
export default router;
