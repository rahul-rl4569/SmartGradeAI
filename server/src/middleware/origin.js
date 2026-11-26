import { env } from "../config/env.js";
// Reject cross-origin state-changing requests. CORS is an additional browser boundary, not authentication.
export function verifyRequestOrigin(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && origin !== env.CLIENT_URL)
    return res.status(403).json({
      error: {
        code: "ORIGIN_REJECTED",
        message: "Request origin was not accepted.",
      },
    });
  next();
}
