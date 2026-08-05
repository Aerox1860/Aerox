import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ShieldAlert, Lock, Sparkles, LifeBuoy, Calendar } from "lucide-react";

/**
 * User-facing Deposit Limit page.
 *
 * Rules (strict responsible-gambling posture):
 *   1. User can SET a deposit limit only if they don't already have one.
 *   2. Once set, the limit is FROZEN on the user side — they cannot modify
 *      or remove it themselves. They must contact support/admin.
 *   3. Admin resets the limit → user can set a fresh one.
 *
 * This screen shows two states:
 *   • No limit yet → editor with suggestions & confirm.
 *   • Limit already set → read-only "Locked · contact support" card with
 *     current cap, used amount, remaining, and set-date.
 */
const SUGGESTED = [1000, 5000, 10000, 25000, 50000, 100000];

export default function Limits() {
  const [lim, setLim] = useState(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSet, setConfirmSet] = useState(false);

  const refresh = async () => {
    try {
      const { data } = await api.get("/limits/me");
      setLim(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load limit");
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    const val = parseFloat(amount);
    if (!(val > 0)) { toast.error("Enter a positive amount"); return; }
    if (!confirmSet) {
      toast.error("Please confirm — this limit cannot be changed by you later.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/limits/set", { amount: val });
      toast.success("Limit set — you're all locked in for safe play.");
      setConfirmSet(false);
      setAmount("");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not set limit");
    } finally { setSaving(false); }
  };

  const cap    = lim?.amount ? Number(lim.amount) : 0;
  const used   = Number(lim?.used || 0);
  const setAt  = lim?.set_at ? new Date(lim.set_at) : null;
  const pct    = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const remain = Math.max(0, cap - used);
  const reached = cap > 0 && used >= cap;
  const hasLimit = cap > 0;

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="limits-page">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <header>
          <h1 className="font-heading font-black text-2xl">Deposit limit</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Take control of your spending. Set a maximum deposit you can make.
          </p>
        </header>

        {hasLimit ? (
          /* ─────── Limit already set — READ-ONLY, admin-only reset ─────── */
          <>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5" data-testid="limit-status-card">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Your limit</div>
                <div className={`text-[10px] uppercase tracking-widest font-bold ${reached ? "text-red-600" : "text-emerald-600"}`}>
                  {reached ? "Reached" : "Active"}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-3xl font-black text-slate-900">₹{cap.toLocaleString("en-IN")}</div>
                <div className="text-xs text-slate-500">ceiling</div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  data-testid="limit-progress"
                  className={`h-full rounded-full transition-all ${reached ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5">
                <span>Used ₹{used.toLocaleString("en-IN")} ({pct}%)</span>
                <span>Remaining ₹{remain.toLocaleString("en-IN")}</span>
              </div>
              {setAt && (
                <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Set on {setAt.toLocaleDateString()} at {setAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-2" data-testid="limit-locked-panel">
              <div className="flex items-center gap-2 text-red-700 font-bold">
                <Lock className="w-4 h-4" /> Limit is locked
              </div>
              <p className="text-sm text-red-700/90">
                For your safety, a deposit limit can only be reset by our support team.
                Please contact us if you'd like to modify or remove your limit.
              </p>
              <Link
                to="/support"
                data-testid="contact-support-btn"
                className="inline-flex items-center gap-1.5 mt-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold shadow-sm hover:bg-red-700"
              >
                <LifeBuoy className="w-4 h-4" /> Contact support
              </Link>
            </div>
          </>
        ) : (
          /* ─────── No limit — one-time setter ─────── */
          <>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5" data-testid="limit-status-card">
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-500" />
                No limit set — you can deposit any amount right now.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-3" data-testid="limit-editor">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
                  Set a limit (₹)
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  data-testid="limit-input"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                    data-testid={`suggest-${v}`}
                  >
                    ₹{v.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 mt-1 cursor-pointer" data-testid="limit-confirm-check">
                <input
                  type="checkbox"
                  checked={confirmSet}
                  onChange={(e) => setConfirmSet(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I understand that <b>only admin</b> can reset this limit. I cannot change or remove it myself.
                </span>
              </label>

              <button
                onClick={save}
                disabled={saving || !confirmSet || !amount}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-sm font-bold shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="save-limit-btn"
              >
                {saving ? "Saving…" : "Set limit"}
              </button>
            </div>
          </>
        )}

        <p className="text-[11px] text-slate-400">
          Deposit limits count only <b>approved</b> deposits since the moment you set the limit.
          To reset, please contact support — an admin will unlock it so you can set a fresh limit.
        </p>
      </div>
    </div>
  );
}
