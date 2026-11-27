const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const defaultApiUrl = import.meta.env.PROD
  ? "https://smartgradeai.onrender.com/api"
  : "http://127.0.0.1:4000/api";

export const API_BASE = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, "");
