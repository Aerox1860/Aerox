import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { new_password: pw, confirm_password: confirm });
      toast.success("Password updated. You're all set.");
      const u = await refresh();
      nav(u?.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  const strength = (() => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[a-z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  })();
  const strengthLabel = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][strength];
  const strengthColor = ["bg-red-500", "bg-red-400", "bg-yellow-400", "bg-yellow-300", "bg-green-400", "bg-green-500"][strength];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden" data-testid="change-password-page">
      <div className="absolute inset-0 bg-[#06090F]" />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center shadow-[0_0_30px_rgba(34,211,238,0.45)] mb-3">
            <KeyRound className="w-7 h-7 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-3xl font-black tracking-tighter">Set a new password</h1>
          <p className="text-slate-400 text-sm mt-1 text-center">
            {user?.must_change_password
              ? "You logged in with a temporary password. Please choose a new one before you continue."
              : "Update your password below."}
          </p>
        </div>

        <form onSubmit={submit} className="card-surface p-6 space-y-4" data-testid="change-password-form">
          <div className="chip !border-cyan-500/40 !text-cyan-300 w-full justify-start !py-2">
            <ShieldCheck className="w-4 h-4" /> Signed in as {user?.email}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">New password</label>
            <div className="relative mt-1">
              <input type={show ? "text" : "password"} required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)}
                className="w-full bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 pr-10 outline-none focus:border-cyan-500 font-mono"
                placeholder="At least 6 characters"
                data-testid="new-password-input" autoFocus />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-200" tabIndex={-1}>
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {pw && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded ${i < strength ? strengthColor : "bg-white/10"}`} />
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{strengthLabel}</div>
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Confirm password</label>
            <input type={show ? "text" : "password"} required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 font-mono"
              placeholder="Repeat the new password"
              data-testid="confirm-password-input" />
            {confirm && pw && confirm !== pw && (
              <div className="text-xs text-red-400 mt-1">Passwords do not match</div>
            )}
          </div>

          <button type="submit" disabled={busy || !pw || pw !== confirm} className="btn-primary w-full py-3 rounded-lg flex items-center justify-center gap-2" data-testid="change-password-submit-btn">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save new password
          </button>

          {!user?.must_change_password && (
            <button type="button" onClick={() => { logout(); nav("/login"); }} className="w-full text-sm text-slate-400 hover:text-slate-200" data-testid="skip-change-btn">
              Cancel and log out
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
