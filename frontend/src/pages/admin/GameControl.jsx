import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Play, Pause, Wrench, Sparkles, Plane, Disc, Trophy, TrendingUp, TrendingDown, Coins } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const BIAS_OPTIONS = [
  { id: "normal",     label: "Normal",     desc: "Provably-fair, standard house edge", color: "text-emerald-300", border: "border-emerald-400/60" },
  { id: "aggressive", label: "Aggressive", desc: "~70% rounds crash below 2.0x",       color: "text-amber-300",   border: "border-amber-400/60"  },
  { id: "ruthless",   label: "Ruthless",   desc: "~90% below 2.0x, capped near 3x",    color: "text-red-300",     border: "border-red-500/60"    },
];

export default function AdminGameControl() {
  const [dash, setDash] = useState(null);
  const [edge, setEdge] = useState("0.03");
  const [gs, setGs] = useState({ crash: true, roulette: true, bias_mode: "normal" });
  const [vstats, setVstats] = useState(null);

  const loadDash = () => api.get("/admin/dashboard").then(({ data }) => setDash(data));
  const loadGs   = () => api.get("/admin/games/status").then(({ data }) => setGs(data));
  const loadV    = () => api.get("/virtual/admin/stats").then(({ data }) => setVstats(data)).catch(() => {});

  useEffect(() => {
    loadDash(); loadGs(); loadV();
    const t1 = setInterval(loadDash, 3000);
    const t2 = setInterval(loadGs, 2000);
    const t3 = setInterval(loadV, 4000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, []);

  const saveEdge = async () => {
    try { await api.post("/admin/game/config", { house_edge: Number(edge) }); toast.success("House edge saved"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const togglePause = async () => {
    try { await api.post("/admin/game/config", { paused: !dash.paused }); toast.success(dash.paused ? "Round resumed" : "Round paused"); loadDash(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const setBias = async (mode) => {
    try { await api.post("/admin/game/config", { bias_mode: mode }); toast.success(`Bias set: ${mode}`); loadGs(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleGame = async (game, next) => {
    try { await api.post("/admin/games/toggle", { game, enabled: next }); toast.success(`${game} ${next ? "back online" : "set to maintenance"}`); loadGs(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (!dash) return null;

  return (
    <div className="space-y-5" data-testid="admin-game">
      <h1 className="font-heading text-3xl font-black">Game Control</h1>

      {/* Live round card */}
      <div className="card-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">Current round</div>
            <div className="font-mono text-3xl font-bold neon-cyan mt-1">{dash.current_round?.multiplier?.toFixed(2)}x</div>
            <div className="text-sm text-slate-400 mt-1 capitalize">Status: {dash.current_round?.status} • {dash.current_round?.players} players</div>
          </div>
          <button onClick={togglePause}
            className={`px-5 py-3 rounded-xl flex items-center gap-2 ${dash.paused ? "btn-primary" : "btn-danger"}`}
            data-testid="admin-game-toggle-btn">
            {dash.paused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
          </button>
        </div>
      </div>

      {/* Maintenance toggles */}
      <div className="card-surface p-6 space-y-4" data-testid="maintenance-panel">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-yellow-300" />
          <div className="font-heading font-bold">Maintenance Mode</div>
        </div>
        <p className="text-sm text-slate-400">Turn a game OFF to show players an <span className="text-yellow-300">Under Maintenance</span> screen. Bets are blocked while off.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MaintCard id="crash"    label="Crash" icon={Plane} enabled={gs.crash}    live={gs.crash_live}    onToggle={(v) => toggleGame("crash", v)} />
          <MaintCard id="roulette" label="Roulette"    icon={Disc}  enabled={gs.roulette} live={gs.roulette_live} onToggle={(v) => toggleGame("roulette", v)} />
        </div>
      </div>

      {/* Virtual Cricket P&L */}
      <VirtualPnLCard stats={vstats} />

      {/* Crash Bias */}
      <div className="card-surface p-6 space-y-4" data-testid="bias-panel">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-fuchsia-300" />
          <div className="font-heading font-bold">Crash Bias Mode</div>
        </div>
        <p className="text-sm text-slate-400">Controls the crash-point distribution. Higher bias = users lose more often, house wins more.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BIAS_OPTIONS.map((o) => {
            const active = gs.bias_mode === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setBias(o.id)}
                data-testid={`bias-${o.id}-btn`}
                className={`text-left p-4 rounded-xl border transition ${active ? `bg-white/5 ${o.border}` : "border-white/10 hover:border-white/20"}`}
              >
                <div className={`text-sm font-bold uppercase tracking-wider ${active ? o.color : "text-slate-200"}`}>{o.label}</div>
                <div className="text-xs text-slate-400 mt-1">{o.desc}</div>
                {active && <div className="mt-2 text-[10px] text-slate-500">● Active</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* House edge */}
      <div className="card-surface p-6 space-y-3">
        <div className="font-heading font-bold">RTP / house edge</div>
        <p className="text-sm text-slate-400">Only used in <span className="text-emerald-300">Normal</span> bias mode. Typical: 0.02 – 0.05.</p>
        <div className="flex gap-2 items-center">
          <input type="number" step="0.01" min="0" max="0.2" value={edge} onChange={(e) => setEdge(e.target.value)}
            className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 font-mono outline-none focus:border-cyan-500 w-40" data-testid="house-edge-input" />
          <button onClick={saveEdge} className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2" data-testid="house-edge-save-btn"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>
    </div>
  );
}

function MaintCard({ id, label, icon: Icon, enabled, live, onToggle }) {
  const invested = Number(live?.total_invested || 0);
  const players = Number(live?.players || 0);
  const phase = live?.phase;
  return (
    <div className={`p-4 rounded-xl border ${enabled ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-bold">{label}</div>
          <div className={`text-[11px] uppercase tracking-widest ${enabled ? "text-emerald-300" : "text-red-300"}`}>
            {enabled ? "● Online" : "● Maintenance"}
            {enabled && phase && <span className="ml-2 text-slate-400 normal-case tracking-normal">· {phase}</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr,auto,1fr] items-center gap-3">
        {/* Left: total invested this round */}
        <div className="text-left" data-testid={`live-invested-${id}`}>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Live Invested</div>
          <div className="font-mono text-lg font-bold text-yellow-300 leading-tight">
            ₹{invested.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Middle: toggle button */}
        <button
          onClick={() => onToggle(!enabled)}
          data-testid={`maintenance-toggle-${id}`}
          className={`px-3 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap ${enabled ? "btn-danger" : "btn-primary"}`}
        >
          {enabled ? "Set Maintenance" : "Bring Online"}
        </button>

        {/* Right: current round players */}
        <div className="text-right" data-testid={`live-players-${id}`}>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Round Players</div>
          <div className="font-mono text-lg font-bold text-cyan-300 leading-tight">{players}</div>
        </div>
      </div>
    </div>
  );
}

function VirtualPnLCard({ stats }) {
  const totals = stats?.totals || {};
  const byMarket = stats?.by_market || {};
  const bias = stats?.bias_mode || "normal";
  const wagered = Number(totals.total_wagered || 0);
  const paidOut = Number(totals.total_paid_out || 0);
  const profit  = Number(totals.house_profit || 0);
  const positive = profit >= 0;
  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const rows = Object.entries(byMarket).sort((a, b) => (b[1].profit || 0) - (a[1].profit || 0));

  const setBias = async (mode) => {
    try {
      await api.post("/virtual/admin/bias", { bias_mode: mode });
      toast.success(`Virtual bias → ${mode}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="card-surface p-6 space-y-4" data-testid="virtual-pnl-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-300" />
          <div className="font-heading font-bold">Virtual Cricket · House P&L</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Bias</span>
          {["normal", "aggressive", "ruthless"].map((m) => (
            <button
              key={m}
              onClick={() => setBias(m)}
              data-testid={`vbias-${m}`}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition ${
                bias === m
                  ? (m === "ruthless" ? "border-red-400/60 text-red-200 bg-red-500/15"
                   : m === "aggressive" ? "border-amber-400/60 text-amber-200 bg-amber-500/15"
                   : "border-emerald-400/60 text-emerald-200 bg-emerald-500/15")
                  : "border-white/10 text-slate-300 hover:border-white/20"
              }`}
            >{m}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PnLTile label="Total Wagered" value={inr(wagered)}
                 icon={Coins} color="text-slate-100" border="border-white/10" testid="pnl-wagered" />
        <PnLTile label="Total Paid Out" value={inr(paidOut)}
                 icon={TrendingDown} color="text-red-300" border="border-red-500/30" testid="pnl-paid" />
        <PnLTile label="House Profit" value={inr(profit)}
                 icon={positive ? TrendingUp : TrendingDown}
                 color={positive ? "text-green-300" : "text-red-300"}
                 border={positive ? "border-green-500/40" : "border-red-500/40"}
                 testid="pnl-profit" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Breakdown by market</div>
        {rows.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-6">No virtual bets placed yet.</div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-white/5">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">Market</th>
                  <th className="text-right px-3 py-2">Bets</th>
                  <th className="text-right px-3 py-2">Wagered</th>
                  <th className="text-right px-3 py-2">Paid Out</th>
                  <th className="text-right px-3 py-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([m, g]) => (
                  <tr key={m} className="border-t border-white/5">
                    <td className="text-left px-3 py-2 font-mono">{m}</td>
                    <td className="text-right px-3 py-2">{g.count}</td>
                    <td className="text-right px-3 py-2 font-mono">{inr(g.wagered)}</td>
                    <td className="text-right px-3 py-2 font-mono text-red-300">{inr(g.paid_out)}</td>
                    <td className={`text-right px-3 py-2 font-mono font-bold ${g.profit >= 0 ? "text-green-300" : "text-red-300"}`}>{inr(g.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PnLTile({ label, value, icon: Icon, color, border, testid }) {
  return (
    <div className={`rounded-xl border ${border} p-4`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`font-mono text-2xl font-black mt-1 leading-tight ${color}`}>{value}</div>
    </div>
  );
}
