import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  User, Gift, TrendingUp, Award, LifeBuoy, LogOut, Shield, Users, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Me / Profile — white body, colourful action buttons.
 *  • Avatar card: white with soft cyan halo, name/email.
 *  • Stats: 3 rounded cards with coloured accents.
 *  • Daily bonus: yellow-orange gradient CTA.
 *  • Quick links: colourful nav pills (Wallet, Referrals, Support, Logout).
 *  • Bet history: light rows, coloured amounts.
 */
export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const [bets, setBets] = useState([]);

  useEffect(() => {
    api.get("/game/bets/mine?limit=30").then(({ data }) => setBets(data)).catch(() => {});
  }, []);

  const claimDaily = async () => {
    try {
      await api.post("/auth/daily-bonus");
      toast.success("Daily bonus credited");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Already claimed today");
    }
  };

  const totalBets = bets.length;
  const won = bets.filter((b) => b.status === "cashed_out").length;
  const profit = bets.reduce((s, b) => s + (b.profit || 0), 0);

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="profile-page">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Avatar card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-5 flex items-center gap-4">
          <div className="absolute -top-14 -right-8 w-48 h-48 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 grid place-items-center text-2xl font-black text-white shadow-md shrink-0">
            {user?.name?.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Player</div>
            <div className="font-heading text-xl font-black text-slate-900 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={TrendingUp} label="Bets"       value={totalBets}                                                                                         tone="bg-cyan-50 text-cyan-700 border-cyan-200" />
          <Stat icon={Award}      label="Won"        value={won}                                                                                               tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
          <Stat icon={User}       label="Profit/Loss" value={`${profit >= 0 ? "+" : ""}₹${profit.toFixed(2)}`} accent={profit >= 0 ? "text-emerald-600" : "text-rose-600"} tone="bg-amber-50 text-amber-700 border-amber-200" />
        </div>

        {/* Daily bonus */}
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-4 flex items-center gap-3" data-testid="profile-daily-bonus">
          <div className="w-10 h-10 rounded-lg bg-amber-400 grid place-items-center shrink-0 shadow-md">
            <Gift className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">Daily bonus</div>
            <div className="text-xs text-slate-600 truncate">Claim ₹10 every 24 hours — no deposit needed.</div>
          </div>
          <button
            onClick={claimDaily}
            data-testid="claim-daily-profile-btn"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-md hover:shadow-lg shrink-0"
          >
            Claim
          </button>
        </div>

        {/* Quick nav pills */}
        <div className="grid grid-cols-2 gap-2" data-testid="profile-quick-nav">
          <NavPill to="/wallet"      icon={Wallet}    label="Wallet"    tone="bg-cyan-500 text-white" />
          <NavPill to="/referrals"   icon={Users}     label="Referrals" tone="bg-fuchsia-500 text-white" />
          <NavPill to="/leaderboard" icon={Award}     label="Rank"      tone="bg-amber-500 text-white" />
          <NavPill to="/support"     icon={LifeBuoy}  label="Support"   tone="bg-emerald-500 text-white" />
        </div>

        {/* Support link */}
        <Link
          to="/support"
          data-testid="profile-support-link"
          className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 flex items-center justify-between hover:border-cyan-400 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-100 grid place-items-center">
              <Shield className="w-4 h-4 text-cyan-700" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Contact Support</div>
              <div className="text-xs text-slate-500">Deposit not credited? Withdrawal delay? Raise a ticket.</div>
            </div>
          </div>
          <div className="text-cyan-600 font-bold">→</div>
        </Link>

        {/* Logout — full-width red */}
        <button
          onClick={logout}
          data-testid="profile-logout-btn"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-md hover:shadow-lg active:scale-[0.99]"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>

        {/* Recent bets */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5" data-testid="profile-bets-card">
          <h2 className="font-heading font-bold text-slate-900 mb-3">Recent bets</h2>
          <div className="divide-y divide-slate-100" data-testid="my-bets-list">
            {bets.length === 0 && (
              <div className="text-sm text-slate-400 py-6 text-center">No bets yet.</div>
            )}
            {bets.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-mono text-slate-800 font-semibold">₹{b.amount}</div>
                  <div className="text-xs text-slate-500">{new Date(b.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  {b.status === "cashed_out" ? (
                    <>
                      <div className="text-emerald-600 font-mono font-bold">+₹{b.profit?.toFixed(2)}</div>
                      <div className="text-xs text-cyan-600 font-mono">{b.cashout_multiplier?.toFixed(2)}x</div>
                    </>
                  ) : b.status === "lost" ? (
                    <>
                      <div className="text-rose-600 font-mono font-bold">-₹{b.amount.toFixed(2)}</div>
                      <div className="text-xs text-slate-400">bust</div>
                    </>
                  ) : (
                    <div className="text-slate-500">active</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent, tone }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-1 font-mono font-black text-base sm:text-lg ${accent || "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function NavPill({ to, icon: Icon, label, tone }) {
  return (
    <Link
      to={to}
      data-testid={`profile-nav-${label.toLowerCase()}`}
      className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shadow-sm hover:shadow-md hover:brightness-105 transition ${tone}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </Link>
  );
}
