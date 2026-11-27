const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = import.meta.env.PROD
  ? "https://smartgradeai.onrender.com/api"
  : "http://127.0.0.1:4000/api";
const configuredUrlIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(
  configuredApiUrl || "",
);
const selectedApiUrl =
  import.meta.env.PROD && configuredUrlIsLocal
    ? defaultApiUrl
    : configuredApiUrl || defaultApiUrl;

const apiOrigin = selectedApiUrl
  .replace(/\/+$/, "")
  .replace(/(?:\/api)+$/i, "");

export const API_BASE = `${apiOrigin}/api`;
