import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "../..");
const projectRoot = path.resolve(serverRoot, "..");
dotenv.config({
  path: [path.join(projectRoot, ".env"), path.join(serverRoot, ".env")],
});
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z
    .string()
    .default(
      process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
    ),
  CLIENT_URL: z.string().url().default("http://127.0.0.1:5173"),
  DATABASE_PATH: z.string().default("./data/smartgrade.sqlite"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("development-only-change-this-secret-32chars"),
  AUTH_COOKIE_NAME: z.string().default("smartgrade_session"),
  SESSION_TTL: z.string().default("8h"),
  PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(60)
    .default(20),
  UPLOAD_DIRECTORY: z.string().default("./uploads"),
  MAX_UPLOAD_SIZE: z.coerce.number().int().positive().default(10485760),
  GRADING_AI_BASE_URL: z.string().trim().optional().default(""),
  GRADING_AI_API_KEY: z.string().trim().optional().default(""),
  GRADING_AI_MODEL: z.string().trim().optional().default(""),
  GRADING_AI_TIMEOUT_MS: z.coerce.number().int().min(10000).max(180000).default(90000),
  GOOGLE_CLOUD_PROJECT: z.string().trim().optional().default(""),
  GOOGLE_CLOUD_STORAGE_BUCKET: z.string().trim().optional().default(""),
  GOOGLE_CLOUD_VISION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30000)
    .max(900000)
    .default(600000),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default(""),
});
const parsed = envSchema
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production") {
      if (
        value.JWT_SECRET === "development-only-change-this-secret-32chars" ||
        value.JWT_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message:
            "Set a unique JWT_SECRET of at least 32 characters in production.",
        });
      }
      if (
        /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value.CLIENT_URL)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLIENT_URL"],
          message:
            "Set CLIENT_URL to the deployed frontend origin in production.",
        });
      }
    }
  })
  .safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}
const config = parsed.data;
export const env = {
  ...config,
  serverRoot,
  databasePath: path.isAbsolute(config.DATABASE_PATH)
    ? config.DATABASE_PATH
    : path.resolve(serverRoot, config.DATABASE_PATH),
  uploadDirectory: path.isAbsolute(config.UPLOAD_DIRECTORY)
    ? config.UPLOAD_DIRECTORY
    : path.resolve(serverRoot, config.UPLOAD_DIRECTORY),
};
