import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plane, Loader2, Gift, ShieldCheck } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LegalModal, TERMS_TEXT, PRIVACY_TEXT } from "@/components/Legal";

export default function Register() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState(params.get("ref") || "");
  const [age18, setAge18] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // 'terms' | 'privacy'
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!age18) return toast.error("You must confirm you are 18 or older");
    if (!policy) return toast.error("You must accept the Terms and Privacy Policy");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email: email.trim().toLowerCase(),
        password, name,
        referral_code: referral ? referral.toUpperCase() : null,
        age_confirmed: age18,
        policy_agreed: policy,
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

  const canSubmit = age18 && policy && !loading;

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

          <div className="card-raised p-4 space-y-3" data-testid="register-consent-block">
            <label className="flex gap-3 items-start cursor-pointer">
              <input type="checkbox" checked={age18} onChange={(e) => setAge18(e.target.checked)}
                className="mt-1 w-4 h-4 accent-cyan-500 cursor-pointer" data-testid="age-checkbox" />
              <span className="text-sm text-slate-200 leading-snug">
                I confirm I am <span className="text-cyan-300 font-semibold">18 years of age or older</span> and legally allowed to play in my jurisdiction.
              </span>
            </label>
            <label className="flex gap-3 items-start cursor-pointer">
              <input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)}
                className="mt-1 w-4 h-4 accent-cyan-500 cursor-pointer" data-testid="policy-checkbox" />
              <span className="text-sm text-slate-200 leading-snug">
                I have read and agree to the{" "}
                <button type="button" onClick={() => setModal("terms")} className="text-cyan-300 underline hover:text-cyan-200" data-testid="open-terms-link">Terms & Rules</button>
                {" "}and{" "}
                <button type="button" onClick={() => setModal("privacy")} className="text-cyan-300 underline hover:text-cyan-200" data-testid="open-privacy-link">Privacy Policy</button>.
              </span>
            </label>
          </div>

          <button type="submit" disabled={!canSubmit}
            className="btn-primary w-full py-3 rounded-lg flex items-center justify-center gap-2"
            data-testid="register-submit-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Create account
          </button>
          <div className="text-sm text-slate-400 text-center">
            Already have an account? <Link to="/login" className="text-cyan-400" data-testid="go-login-link">Log in</Link>
          </div>
        </form>
      </div>

      {modal === "terms" && <LegalModal title="Terms & House Rules" text={TERMS_TEXT} onClose={() => setModal(null)} />}
      {modal === "privacy" && <LegalModal title="Privacy Policy" text={PRIVACY_TEXT} onClose={() => setModal(null)} />}
    </div>
  );
}
