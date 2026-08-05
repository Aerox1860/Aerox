import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Radio, Sparkles, Trophy, Plus, Trash2, ToggleLeft, ToggleRight, Save } from "lucide-react";

const SPORT_OPTIONS = [
  { key: "cricket",       label: "Cricket",       icon: Radio },
  { key: "football",      label: "Football",      icon: Sparkles },
  { key: "horse_racing",  label: "Horse Racing",  icon: Trophy },
  { key: "other",         label: "Other",         icon: Sparkles },
];

const EMPTY = {
  sport: "cricket",
  team1_name: "",
  team2_name: "",
  match_time: "",
  team1_players: "",  // comma-separated in the UI, split before sending
  team2_players: "",
  odds_team1_back: "",
  odds_team1_lay:  "",
  odds_team2_back: "",
  odds_team2_lay:  "",
  odds_draw:       "",
  is_live: true,
  tournament: "",
};

/** Admin — Matches Management. Push featured matches to the player lobby. */
export default function AdminMatches() {
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const { data } = await api.get("/admin/featured/matches");
      setMatches(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load matches");
    }
  };
  useEffect(() => { refresh(); }, []);

  const setField = (k, v) => setForm({ ...form, [k]: v });

  const _toPayload = () => ({
    sport: form.sport,
    team1_name: form.team1_name.trim(),
    team2_name: form.team2_name.trim(),
    match_time: form.match_time ? new Date(form.match_time).toISOString() : null,
    team1_players: form.team1_players.split(",").map((s) => s.trim()).filter(Boolean),
    team2_players: form.team2_players.split(",").map((s) => s.trim()).filter(Boolean),
    odds_team1_back: form.odds_team1_back === "" ? null : parseFloat(form.odds_team1_back),
    odds_team1_lay:  form.odds_team1_lay  === "" ? null : parseFloat(form.odds_team1_lay),
    odds_team2_back: form.odds_team2_back === "" ? null : parseFloat(form.odds_team2_back),
    odds_team2_lay:  form.odds_team2_lay  === "" ? null : parseFloat(form.odds_team2_lay),
    odds_draw:       form.odds_draw       === "" ? null : parseFloat(form.odds_draw),
    is_live: !!form.is_live,
    tournament: form.tournament.trim() || null,
  });

  const save = async () => {
    if (!form.team1_name || !form.team2_name) {
      toast.error("Enter both team names");
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/admin/featured/matches/${editingId}`, _toPayload());
        toast.success("Match updated");
      } else {
        await api.post("/admin/featured/matches", _toPayload());
        toast.success("Match pushed to lobby");
      }
      setForm(EMPTY);
      setEditingId(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  const edit = (m) => {
    setEditingId(m.id);
    setForm({
      sport: m.sport,
      team1_name: m.team1_name,
      team2_name: m.team2_name,
      match_time: m.match_time ? m.match_time.substring(0, 16) : "",
      team1_players: (m.team1_players || []).join(", "),
      team2_players: (m.team2_players || []).join(", "),
      odds_team1_back: m.odds_team1_back ?? "",
      odds_team1_lay:  m.odds_team1_lay  ?? "",
      odds_team2_back: m.odds_team2_back ?? "",
      odds_team2_lay:  m.odds_team2_lay  ?? "",
      odds_draw:       m.odds_draw       ?? "",
      is_live: !!m.is_live,
      tournament: m.tournament || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this match?")) return;
    try {
      await api.delete(`/admin/featured/matches/${id}`);
      toast.success("Deleted");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  const toggleLive = async (id) => {
    try {
      await api.post(`/admin/featured/matches/${id}/toggle-live`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Toggle failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-matches-page">
      <div>
        <h1 className="font-heading font-black text-2xl">Featured Matches</h1>
        <p className="text-slate-400 text-sm mt-1">Create matches — push them live and they appear on every player's lobby.</p>
      </div>

      {/* Editor */}
      <div className="card-surface p-5 space-y-4" data-testid="match-editor">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-lg">{editingId ? "Edit match" : "New match"}</h2>
          {editingId && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY); }} className="text-xs text-slate-400 hover:text-slate-200" data-testid="cancel-edit-btn">
              Cancel edit
            </button>
          )}
        </div>

        {/* Sport tabs */}
        <div className="flex flex-wrap gap-2">
          {SPORT_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setField("sport", s.key)}
              data-testid={`sport-${s.key}-btn`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                form.sport === s.key ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/25" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Team 1 name">
            <input value={form.team1_name} onChange={(e) => setField("team1_name", e.target.value)} placeholder="e.g. India" className="input-base" data-testid="team1-input" />
          </Field>
          <Field label="Team 2 name">
            <input value={form.team2_name} onChange={(e) => setField("team2_name", e.target.value)} placeholder="e.g. Australia" className="input-base" data-testid="team2-input" />
          </Field>
          <Field label="Tournament">
            <input value={form.tournament} onChange={(e) => setField("tournament", e.target.value)} placeholder="e.g. IPL 2026" className="input-base" data-testid="tournament-input" />
          </Field>
          <Field label="Match time">
            <input type="datetime-local" value={form.match_time} onChange={(e) => setField("match_time", e.target.value)} className="input-base" data-testid="match-time-input" />
          </Field>
          <Field label="Team 1 players (comma-separated)" span={2}>
            <textarea value={form.team1_players} onChange={(e) => setField("team1_players", e.target.value)} placeholder="Rohit Sharma, Virat Kohli, KL Rahul, ..." className="input-base min-h-[64px]" data-testid="team1-players-input" />
          </Field>
          <Field label="Team 2 players (comma-separated)" span={2}>
            <textarea value={form.team2_players} onChange={(e) => setField("team2_players", e.target.value)} placeholder="Pat Cummins, Steve Smith, ..." className="input-base min-h-[64px]" data-testid="team2-players-input" />
          </Field>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Odds (optional)</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Field label="Team 1 back"><input inputMode="decimal" value={form.odds_team1_back} onChange={(e) => setField("odds_team1_back", e.target.value)} className="input-base" data-testid="odds-t1-back" /></Field>
            <Field label="Team 1 lay"><input inputMode="decimal" value={form.odds_team1_lay}  onChange={(e) => setField("odds_team1_lay",  e.target.value)} className="input-base" data-testid="odds-t1-lay"  /></Field>
            <Field label="Team 2 back"><input inputMode="decimal" value={form.odds_team2_back} onChange={(e) => setField("odds_team2_back", e.target.value)} className="input-base" data-testid="odds-t2-back" /></Field>
            <Field label="Team 2 lay"><input inputMode="decimal" value={form.odds_team2_lay}  onChange={(e) => setField("odds_team2_lay",  e.target.value)} className="input-base" data-testid="odds-t2-lay"  /></Field>
            <Field label="Draw"><input inputMode="decimal" value={form.odds_draw} onChange={(e) => setField("odds_draw", e.target.value)} className="input-base" data-testid="odds-draw" /></Field>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer" data-testid="is-live-toggle">
            <input type="checkbox" checked={form.is_live} onChange={(e) => setField("is_live", e.target.checked)} />
            <span className="text-sm text-slate-200">Push live (visible to players)</span>
          </label>
        </div>

        <button
          onClick={save}
          disabled={loading}
          data-testid="save-match-btn"
          className="btn-primary px-5 py-2.5 rounded-lg inline-flex items-center gap-2 font-semibold disabled:opacity-60"
        >
          {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {editingId ? "Update match" : "Push to lobby"}
        </button>
      </div>

      {/* Existing matches */}
      <div className="card-surface p-5" data-testid="matches-list">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-bold text-lg">All matches ({matches.length})</h2>
          <button onClick={refresh} className="text-xs text-slate-400 hover:text-slate-200">Refresh</button>
        </div>
        {matches.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-sm">No matches yet — create one above.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {matches.map((m) => (
              <div key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid={`match-item-${m.id}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100 text-sm truncate">
                    {m.team1_name} <span className="text-slate-500">vs</span> {m.team2_name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="uppercase">{m.sport}</span>
                    {m.tournament && <span>· {m.tournament}</span>}
                    {m.match_time && <span>· {new Date(m.match_time).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleLive(m.id)} title="Toggle live" className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${m.is_live ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/25" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`} data-testid={`toggle-${m.id}`}>
                    {m.is_live ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {m.is_live ? "Live" : "Off"}
                  </button>
                  <button onClick={() => edit(m)} className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 text-xs" data-testid={`edit-${m.id}`}>
                    Edit
                  </button>
                  <button onClick={() => remove(m.id)} className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs inline-flex items-center gap-1" data-testid={`delete-${m.id}`}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <label className={`block ${span === 2 ? "md:col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
