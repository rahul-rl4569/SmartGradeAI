import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../database/db.js";

const router = Router();
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many contact requests. Please try again later.",
    },
  },
});
const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    subject: z.string().trim().min(2).max(160),
    message: z.string().trim().min(5).max(5000),
  })
  .strict();

router.post("/", contactLimiter, (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the contact form fields and try again.",
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  }

  try {
    const { name, email, subject, message } = parsed.data;
    const result = db
      .prepare(
        `
      INSERT INTO contact_messages (name, email, subject, message)
      VALUES (@name, @email, @subject, @message)
    `,
      )
      .run({ name, email, subject, message });
    return res.status(201).json({
      message: "Thank you. Your message has been received.",
      data: { id: Number(result.lastInsertRowid), status: "received" },
    });
  } catch (error) {
    // Avoid logging submitted content or email addresses.
    console.error(
      "Contact form persistence failed:",
      error?.code || "DATABASE_ERROR",
    );
    return res.status(500).json({
      error: {
        code: "CONTACT_SAVE_FAILED",
        message: "We could not save your message. Please try again later.",
      },
    });
  }
});

export default router;
