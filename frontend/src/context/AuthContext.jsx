import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const AuthCtx = createContext(null);

// Poll user data every 10s while logged in, plus refresh on tab focus,
// so balance/transactions stay in sync across devices.
const POLL_MS = 10000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("aerox_token");
    if (!token) {
      if (mountedRef.current) {
        setUser(null);
        setLoading(false);
      }
      return null;
    }
    try {
      const { data } = await api.get("/auth/me");
      if (mountedRef.current) setUser(data);
      return data;
    } catch (e) {
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        localStorage.removeItem("aerox_token");
        if (mountedRef.current) setUser(null);
      }
      return null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  // Single-session enforcement: when the backend evicts this device
  // (a fresh login happened elsewhere), the axios interceptor fires this event.
  useEffect(() => {
    const onKicked = () => {
      setUser(null);
      toast.error("You were signed out — this account signed in from another device.");
      const path = window.location.pathname;
      const isLogin = path === "/login" || path === "/admin/login" || path === "/register";
      if (!isLogin) {
        const target = path.startsWith("/admin") ? "/admin/login" : "/login";
        // Delay so the Sonner toast has time to render before the hard reload.
        setTimeout(() => window.location.replace(target), 1500);
      }
    };
    window.addEventListener("aerox:session-invalidated", onKicked);
    return () => window.removeEventListener("aerox:session-invalidated", onKicked);
  }, []);

  // Poll while a user is logged in + on tab focus / visibility change
  useEffect(() => {
    if (!user) return;
    const onFocus = () => refresh();
    const onVis = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [user, refresh]);

  const login = (token, u) => {
    localStorage.setItem("aerox_token", token);
    setUser(u);
  };

  const updateUser = (u) => setUser(u);

  const logout = () => {
    localStorage.removeItem("aerox_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, setUser, updateUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
