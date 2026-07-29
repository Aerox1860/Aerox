import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Users, Zap, TrendingUp, Gift, Play, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ContactUsButton } from "@/components/ContactUs";

export default function Lobby() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      try {
        const [{ data: st }, { data: hist }] = await Promise.all([
          api.get("/game/state"),
          api.get("/game/history?limit=15"),
        ]);
        if (!mounted) return;
        setState(st);
        setHistory(hist);
      } catch (e) {}
    };
    fetchAll();
    const t = setInterval(fetchAll, 2000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const claimDaily = async () => {
    try {
      const { data } = await api.post("/auth/daily-bonus");
      toast.success("Daily bonus credited: ₹" + (parseFloat(data.user.balance) - parseFloat(user.balance)).toFixed(0));
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Already claimed");
    }
  };

  const status = state?.status || "waiting";
  const players = state?.bets?.length || 0;
  const multiplier = state?.multiplier || 1.0;

  return (
    <div className="space-y-6" data-testid="lobby-page">
      {/* Hero */}
      <section className="card-surface p-6 md:p-8 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-72 h-72 rounded-full bg-green-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">Live round</div>
          <div className="mt-2 flex items-end gap-3">
            <div className={`multiplier-txt text-5xl md:text-7xl ${status === "crashed" ? "crashed" : ""}`} data-testid="lobby-multiplier">
              {multiplier.toFixed(2)}x
            </div>
            <div className={`chip ${status === "flying" ? "!border-green-500/40 !text-green-300" : status === "crashed" ? "!border-red-500/40 !text-red-300" : "!border-cyan-500/40 !text-cyan-300"}`}>
              {status === "flying" ? "flying" : status === "crashed" ? "crashed" : "waiting"}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatCard icon={Users} label="Players" value={players} />
            <StatCard icon={Zap} label="Round" value={state?.round_id?.slice(0, 6) || "-"} mono />
            <StatCard icon={TrendingUp} label="Last crash" value={history[0]?.crash_at ? history[0].crash_at.toFixed(2) + "x" : "-"} mono />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/game" data-testid="join-game-btn" className="btn-primary px-5 py-3 rounded-xl flex items-center gap-2">
              <Play className="w-4 h-4" /> Join round
            </Link>
            <button onClick={claimDaily} className="btn-ghost px-5 py-3 rounded-xl flex items-center gap-2" data-testid="claim-daily-btn">
              <Gift className="w-4 h-4 text-green-400" /> Claim daily bonus
            </button>
            <ContactUsButton className="!px-5 !py-3" />
          </div>
        </div>
      </section>

      {/* History strip */}
      <section className="card-surface p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-lg font-bold">Recent crashes</h2>
          <span className="text-xs text-slate-400">last {history.length}</span>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="crash-history">
          {history.length === 0 && <div className="text-sm text-slate-500">No rounds yet</div>}
          {history.map((h) => (
            <div key={h.round_id}
              className={`font-mono text-sm px-3 py-1.5 rounded-md border ${
                h.crash_at >= 2 ? "border-green-500/40 text-green-300 bg-green-500/5"
                : h.crash_at >= 1.5 ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/5"
                : "border-red-500/40 text-red-300 bg-red-500/5"
              }`}>
              {h.crash_at.toFixed(2)}x
            </div>
          ))}
        </div>
      </section>

      {/* Info tiles */}
      <section className="grid md:grid-cols-2 gap-4">
        <InfoCard title="How it works" body="Place a bet during the waiting phase. Watch the plane fly & the multiplier climb. Cash out before it crashes to lock in your win. Auto-cashout keeps you safe." icon={Plane} />
        <InfoCard title="Provably fair" body="Every round's crash point is derived from a hashed server seed + client seed. The server seed hash is published before the round; the seed is revealed on crash." icon={Zap} />
      </section>

      {/* Contact Us */}
      <section className="card-surface p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-cyan-300" />
            <h3 className="font-heading font-bold text-lg">Need help?</h3>
          </div>
          <p className="text-sm text-slate-400">Deposit not credited or facing any issue? Reach out to us anytime — we usually reply within a few hours.</p>
        </div>
        <ContactUsButton className="!px-6 !py-3 self-start md:self-auto" />
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, mono }) {
  return (
    <div className="card-raised p-3">
      <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-widest"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={`mt-1 font-bold text-slate-100 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
function InfoCard({ title, body, icon: Icon }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-center gap-2 mb-2"><Icon className="w-4 h-4 text-cyan-300" /><h3 className="font-heading font-bold">{title}</h3></div>
      <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
    </div>
  );
}
