import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { User, Gift, TrendingUp, Award, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [bets, setBets] = useState([]);

  useEffect(() => { api.get("/game/bets/mine?limit=30").then(({ data }) => setBets(data)).catch(() => {}); }, []);

  const claimDaily = async () => {
    try {
      await api.post("/auth/daily-bonus");
      toast.success("Daily bonus credited");
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || "Already claimed today"); }
  };

  const totalBets = bets.length;
  const won = bets.filter((b) => b.status === "cashed_out").length;
  const profit = bets.reduce((s, b) => s + (b.profit || 0), 0);

  return (
    <div className="space-y-5" data-testid="profile-page">
      <div className="card-surface p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center text-2xl font-black text-black">
          {user?.name?.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400">Pilot</div>
          <div className="font-heading text-2xl font-black">{user?.name}</div>
          <div className="text-sm text-slate-500">{user?.email}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat icon={TrendingUp} label="Total bets" value={totalBets} />
        <Stat icon={Award} label="Won rounds" value={won} />
        <Stat icon={User} label="Profit / Loss" value={`${profit >= 0 ? "+" : ""}₹${profit.toFixed(2)}`} accent={profit >= 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className="card-surface p-5 flex items-center justify-between">
        <div>
          <div className="font-heading font-bold">Daily bonus</div>
          <div className="text-sm text-slate-400">Claim ₹10 every 24 hours.</div>
        </div>
        <button onClick={claimDaily} className="btn-primary px-5 py-3 rounded-xl flex items-center gap-2" data-testid="claim-daily-profile-btn">
          <Gift className="w-4 h-4" /> Claim
        </button>
      </div>

      <Link to="/support" className="card-surface p-5 flex items-center justify-between hover:border-cyan-500/40 transition-colors block" data-testid="profile-support-link">
        <div>
          <div className="font-heading font-bold flex items-center gap-2"><LifeBuoy className="w-4 h-4 text-cyan-300" /> Contact Support</div>
          <div className="text-sm text-slate-400">Deposit not credited? Withdrawal delay? Send a ticket with your details.</div>
        </div>
        <div className="text-cyan-300">→</div>
      </Link>

      <div className="card-surface p-5">
        <h2 className="font-heading font-bold mb-3">Recent bets</h2>
        <div className="divide-y divide-white/5" data-testid="my-bets-list">
          {bets.length === 0 && <div className="text-sm text-slate-500 py-2">No bets yet</div>}
          {bets.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="font-mono">₹{b.amount}</div>
                <div className="text-xs text-slate-500">{new Date(b.created_at).toLocaleString()}</div>
              </div>
              <div className="text-right">
                {b.status === "cashed_out" ? (
                  <>
                    <div className="text-green-400 font-mono">+₹{b.profit?.toFixed(2)}</div>
                    <div className="text-xs text-cyan-300 font-mono">{b.cashout_multiplier?.toFixed(2)}x</div>
                  </>
                ) : b.status === "lost" ? (
                  <>
                    <div className="text-red-400 font-mono">-₹{b.amount.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">bust</div>
                  </>
                ) : (
                  <div className="text-slate-400">active</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={`mt-1 font-mono font-bold text-2xl ${accent || "text-slate-100"}`}>{value}</div>
    </div>
  );
}
