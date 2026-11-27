import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { isAllowedClientOrigin } from "./config/clientOrigins.js";
import healthRouter from "./routes/health.js";
import contactRouter from "./routes/contact.js";
import authRouter from "./routes/auth.js";
import classesRouter from "./routes/classes.js";
import enrollmentsRouter from "./routes/enrollments.js";
import assignmentsRouter from "./routes/assignments.js";
import submissionsRouter from "./routes/submissions.js";
import questionPapersRouter from "./routes/questionPapers.js";
import analyticsRouter from "./routes/analytics.js";
import pdfReportsRouter from "./routes/pdfReports.js";
import notificationsRouter from "./routes/notifications.js";
import adminRouter from "./routes/admin.js";
import cookieParser from "cookie-parser";
import { verifyRequestOrigin } from "./middleware/origin.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, Boolean(origin && isAllowedClientOrigin(origin)));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use(cookieParser());
app.use(verifyRequestOrigin);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/contact", contactRouter);
app.use("/api/classes", classesRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/submissions", submissionsRouter);
app.use("/api/question-papers", questionPapersRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/reports", pdfReportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin", adminRouter);
app.use((_req, res) =>
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint was not found.",
    },
  }),
);
app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err?.message ?? "Unknown error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred.",
    },
  });
});
