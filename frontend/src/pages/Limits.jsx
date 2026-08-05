import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ShieldAlert, Lock, Sparkles, LifeBuoy } from "lucide-react";

/**
 * User-facing Set Limits page.
 *   • Shows current limit, cumulative used since it was set, and a
 *     progress bar towards the ceiling.
 *   • Lets the user SET or MODIFY the limit while it isn't yet reached.
 *   • Once used ≥ amount, the input is disabled and a Contact Support
 *     panel appears explaining what to do.
 */
const SUGGESTED = [1000, 5000, 10000, 25000, 50000, 100000];

export default function Limits() {
  const { user } = useAuth();
  const [lim, setLim] = useState(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const { data } = await api.get("/limits/me");
      setLim(data);
      if (data.amount) setAmount(String(data.amount));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load limit");
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    const val = parseFloat(amount);
    if (!(val > 0)) { toast.error("Enter a positive amount"); return; }
    setSaving(true);
    try {
      await api.post("/limits/set", { amount: val });
      toast.success("Limit updated");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update limit");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm("Remove your deposit limit? You'll be able to deposit any amount again.")) return;
    try {
      await api.delete("/limits/me");
      toast.success("Limit removed");
      setAmount("");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not remove limit");
    }
  };

  const locked = !!lim?.locked;
  const cap    = lim?.amount ? Number(lim.amount) : 0;
  const used   = Number(lim?.used || 0);
  const pct    = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const remain = Math.max(0, cap - used);

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="limits-page">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <header>
          <h1 className="font-heading font-black text-2xl">Set deposit limits</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Take control of your spending. Set a max amount you can deposit.
          </p>
        </header>

        {/* Current status card */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4" data-testid="limit-status-card">
          {cap > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Current limit</div>
                <div className={`text-[10px] uppercase tracking-widest font-bold ${locked ? "text-red-600" : "text-emerald-600"}`}>
                  {locked ? "Locked · Reached" : "Active"}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="text-3xl font-black text-slate-900">₹{cap.toLocaleString("en-IN")}</div>
                <div className="text-xs text-slate-500">ceiling</div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  data-testid="limit-progress"
                  className={`h-full rounded-full transition-all ${locked ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5">
                <span>Used ₹{used.toLocaleString("en-IN")} ({pct}%)</span>
                <span>Remaining ₹{remain.toLocaleString("en-IN")}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-500" />
              No limit set — you can deposit any amount right now.
            </div>
          )}
        </div>

        {/* Setter / editor */}
        {locked ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2" data-testid="limit-locked-panel">
            <div className="flex items-center gap-2 text-red-700 font-bold">
              <Lock className="w-4 h-4" /> Your limit is locked
            </div>
            <p className="text-sm text-red-700/90">
              You've reached your self-imposed cap. To continue depositing, please contact support and ask them to reset your limit.
            </p>
            <Link
              to="/support"
              data-testid="contact-support-btn"
              className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold shadow-sm hover:bg-red-700"
            >
              <LifeBuoy className="w-4 h-4" /> Contact support
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3" data-testid="limit-editor">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1">
                {cap > 0 ? "Modify limit (₹)" : "Set a limit (₹)"}
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-sm font-bold shadow-sm hover:shadow-md disabled:opacity-60"
                data-testid="save-limit-btn"
              >
                {saving ? "Saving…" : cap > 0 ? "Update limit" : "Set limit"}
              </button>
              {cap > 0 && (
                <button
                  onClick={remove}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold"
                  data-testid="remove-limit-btn"
                >
                  Remove limit
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          Deposit limits count only <b>approved</b> deposits since the moment you set the limit.
          When the limit is reached, it locks — you'll need to contact support to reset it.
        </p>
      </div>
    </div>
  );
}
