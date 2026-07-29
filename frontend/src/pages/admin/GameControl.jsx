import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Play, Pause } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export default function AdminGameControl() {
  const [dash, setDash] = useState(null);
  const [edge, setEdge] = useState("0.03");

  const load = () => api.get("/admin/dashboard").then(({ data }) => setDash(data));
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  const save = async () => {
    try { await api.post("/admin/game/config", { house_edge: Number(edge) }); toast.success("Saved"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggle = async () => {
    try { await api.post("/admin/game/config", { paused: !dash.paused }); toast.success("Updated"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (!dash) return null;

  return (
    <div className="space-y-5" data-testid="admin-game">
      <h1 className="font-heading text-3xl font-black">Game Control</h1>

      <div className="card-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400">Current round</div>
            <div className="font-mono text-3xl font-bold neon-cyan mt-1">{dash.current_round?.multiplier?.toFixed(2)}x</div>
            <div className="text-sm text-slate-400 mt-1 capitalize">Status: {dash.current_round?.status} • {dash.current_round?.players} players</div>
          </div>
          <button onClick={toggle} className={`px-5 py-3 rounded-xl flex items-center gap-2 ${dash.paused ? "btn-primary" : "btn-danger"}`} data-testid="admin-game-toggle-btn">
            {dash.paused ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
          </button>
        </div>
      </div>

      <div className="card-surface p-6 space-y-3">
        <div className="font-heading font-bold">RTP / house edge</div>
        <p className="text-sm text-slate-400">A higher house edge means lower average crash points (favor for house). Typical: 0.02 – 0.05.</p>
        <div className="flex gap-2 items-center">
          <input type="number" step="0.01" min="0" max="0.2" value={edge} onChange={(e) => setEdge(e.target.value)}
            className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 font-mono outline-none focus:border-cyan-500 w-40" data-testid="house-edge-input" />
          <button onClick={save} className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2" data-testid="house-edge-save-btn"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>
    </div>
  );
}
