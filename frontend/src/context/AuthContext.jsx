import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";

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
