import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aerox_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Detect the single-session eviction signal from the backend and clear the
// local token. AuthContext listens for the `aerox:session-invalidated` event
// and redirects the user to /login with a toast.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    const detailStr = typeof detail === "string" ? detail : "";
    if (status === 401 && detailStr.startsWith("SESSION_INVALIDATED")) {
      if (localStorage.getItem("aerox_token")) {
        localStorage.removeItem("aerox_token");
        window.dispatchEvent(
          new CustomEvent("aerox:session-invalidated", { detail: detailStr })
        );
      }
    }
    return Promise.reject(err);
  }
);

export function formatApiError(e) {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(", ");
  return typeof d?.msg === "string" ? d.msg : JSON.stringify(d);
}

export function wsUrl() {
  // convert https/http to wss/ws
  const httpUrl = BACKEND_URL;
  const wsProto = httpUrl.startsWith("https") ? "wss" : "ws";
  const host = httpUrl.replace(/^https?:\/\//, "");
  return `${wsProto}://${host}/api/ws`;
}
