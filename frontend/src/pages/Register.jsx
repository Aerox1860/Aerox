import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plane, Loader2, Gift } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Register() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(params.get("ref") || "");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email: email.trim().toLowerCase(),
        password, name,
        referral_code: referral ? referral.toUpperCase() : null,
      });
      login(data.token, data.user);
      toast.success(`Welcome ${data.user.name}! ₹${data.user.balance} signup bonus credited.`);
      nav("/");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-30" style={{
        backgroundImage: `url(https://images.unsplash.com/photo-1687639166604-b91cf403fe61?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MDV8MHwxfHNlYXJjaHw0fHxuZW9uJTIwY3lhbiUyMGdyZWVuJTIwZGFyayUyMGFic3RyYWN0JTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODUzMTA1MzJ8MA&ixlib=rb-4.1.0&q=85)`,
        backgroundSize: "cover"
      }} />
      <div className="absolute inset-0 bg-[#06090F]/70" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center shadow-[0_0_30px_rgba(34,211,238,0.45)] mb-3">
            <Plane className="w-7 h-7 text-black" strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-3xl font-black tracking-tighter">Join AeroX</h1>
          <div className="text-slate-400 text-sm mt-1 flex items-center gap-1"><Gift className="w-4 h-4 text-green-400" /> ₹50 signup bonus</div>
        </div>

        <form onSubmit={submit} className="card-surface p-6 space-y-4" data-testid="register-form">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
              placeholder="Your name" data-testid="register-name-input" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
              placeholder="you@example.com" data-testid="register-email-input" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Password (min 6)</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
              placeholder="••••••••" data-testid="register-password-input" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Referral code (optional)</label>
            <input value={referral} onChange={(e) => setReferral(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 uppercase font-mono"
              placeholder="AB12CD" data-testid="register-referral-input" />
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full py-3 rounded-lg flex items-center justify-center gap-2"
            data-testid="register-submit-btn">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Create account
          </button>
          <div className="text-sm text-slate-400 text-center">
            Already have an account? <Link to="/login" className="text-cyan-400" data-testid="go-login-link">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
