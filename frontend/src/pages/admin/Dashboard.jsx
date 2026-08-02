import { useEffect, useState } from "react";
import { Users, ArrowDownToLine, ArrowUpFromLine, Plane, Play, Pause, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  const load = () => api.get("/admin/dashboard").then(({ data }) => setData(data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const togglePause = async () => {
    try { await api.post("/admin/game/config", { paused: !data.paused }); toast.success("Updated"); load(); }
    catch (e) { toast.error("Failed"); }
  };

  if (!data) return <div className="text-slate-400 text-sm">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="font-heading text-3xl font-black">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Live overview of your GoWin365 platform.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Users" value={data.total_users} sub={`${data.blocked_users} blocked`} />
        <Stat icon={ArrowDownToLine} label="Pending deposits" value={data.pending_deposits} sub={`₹${data.total_deposits.toLocaleString()} approved`} accent="text-yellow-300" />
        <Stat icon={ArrowUpFromLine} label="Pending withdrawals" value={data.pending_withdrawals} sub={`₹${data.total_withdrawals.toLocaleString()} paid`} accent="text-yellow-300" />
        <Stat icon={Activity} label="Total bets" value={data.total_bets} sub="all rounds" />
      </div>

      <div className="card-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">Current round</div>
            <div className="mt-1 font-mono text-2xl font-bold neon-cyan">
              {data.current_round?.multiplier?.toFixed(2)}x
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Status: <span className="text-slate-200 capitalize">{data.current_round?.status}</span> • {data.current_round?.players} players
            </div>
          </div>
          <button onClick={togglePause} className={`px-5 py-3 rounded-xl flex items-center gap-2 ${data.paused ? "btn-primary" : "btn-danger"}`} data-testid="toggle-pause-btn">
            {data.paused ? <><Play className="w-4 h-4" /> Resume game</> : <><Pause className="w-4 h-4" /> Pause game</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-slate-400">{label}</div>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className={`mt-2 font-mono font-black text-3xl ${accent || "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
