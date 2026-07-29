import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Plane, Loader2, ShieldCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Login({ adminMode = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isAdminMode = adminMode || loc.pathname === "/admin/login";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email: email.trim().toLowerCase(), password });
      if (isAdminMode && data.user.role !== "admin") {
        toast.error("This account is not an admin");
        setLoading(false);
        return;
      }
      login(data.token, data.user);
      toast.success(`Welcome ${data.user.role === "admin" ? "back, Admin" : data.user.name}`);
      nav(data.user.role === "admin" ? "/admin" : "/");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40" style={{
        backgroundImage: `url(https://images.unsplash.com/photo-1768677024829-b6691d27f42b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMG5lb24lMjBhaXJwbGFuZSUyMGRhcmt8ZW58MHx8fHwxNzg0ODcwMjAxfDA&ixlib=rb-4.1.0&q=85)`,
        backgroundSize: "cover", backgroundPosition: "center"
      }} />
      <div className="absolute inset-0 bg-[#06090F]/70" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className={`w-14 h-14 rounded-2xl grid place-items-center mb-3 ${
            isAdminMode
              ? "bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-[0_0_30px_rgba(6,182,212,0.55)]"
              : "bg-gradient-to-br from-cyan-500 to-green-500 shadow-[0_0_30px_rgba(34,211,238,0.45)]"
          }`}>
            {isAdminMode ? <ShieldCheck className="w-7 h-7 text-black" strokeWidth={2.5} /> : <Plane className="w-7 h-7 text-black" strokeWidth={2.5} />}
          </div>
          <h1 className="font-heading text-4xl font-black tracking-tighter">
            {isAdminMode ? "AeroX Admin" : "AeroX"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {isAdminMode ? "Operator portal — restricted access" : "Fly high. Cash out before the crash."}
          </p>
        </div>

        <form onSubmit={submit} className="card-surface p-6 space-y-4" data-testid={isAdminMode ? "admin-login-form" : "login-form"}>
          <h2 className="font-heading text-xl font-bold flex items-center gap-2">
            {isAdminMode && <ShieldCheck className="w-5 h-5 text-cyan-400" />}
            {isAdminMode ? "Admin log in" : "Log in"}
          </h2>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Email</label>
            <input
              type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 transition-colors"
              placeholder="you@example.com"
              data-testid={isAdminMode ? "admin-login-email-input" : "login-email-input"}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Password</label>
            <input
              type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 transition-colors"
              placeholder="Enter password"
              data-testid={isAdminMode ? "admin-login-password-input" : "login-password-input"}
            />
          </div>
          <button
            type="submit" disabled={loading}
            className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 ${isAdminMode ? "btn-cyan" : "btn-primary"}`}
            data-testid={isAdminMode ? "admin-login-submit-btn" : "login-submit-btn"}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} {isAdminMode ? "Enter admin portal" : "Log in"}
          </button>

          {isAdminMode ? (
            <div className="text-sm text-slate-400 text-center">
              Not an admin? <Link to="/login" className="text-cyan-400 hover:text-cyan-300" data-testid="switch-to-player-login">Player login</Link>
            </div>
          ) : (
            <div className="text-sm text-slate-400 text-center space-y-1">
              <div>New here? <Link to="/register" className="text-cyan-400 hover:text-cyan-300" data-testid="go-register-link">Create an account</Link></div>
              <div className="text-xs"><Link to="/admin/login" className="text-slate-500 hover:text-cyan-400" data-testid="go-admin-login-link">Admin portal login →</Link></div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
