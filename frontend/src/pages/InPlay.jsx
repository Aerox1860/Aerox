import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Calendar, MapPin, Coins, X, Trophy, Clock, Zap, Users, Loader2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

// Data comes from the backend cricket proxy (CricAPI). Poll every 30s so
// the free-tier quota (100 hits/day) is preserved via server-side cache.
const POLL_MS = 30000;

export default function InPlay() {
  const [live, setLive] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("live");
  const [openMatch, setOpenMatch] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/inplay/matches");
        if (!alive) return;
        setLive(data.live || []);
        setUpcoming(data.upcoming || []);
        setErr(null);
      } catch (e) {
        if (alive) setErr(e?.response?.data?.detail || e?.message || "Failed to fetch matches");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const rows = tab === "live" ? live : upcoming;

  return (
    <div className="space-y-5" data-testid="inplay-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-400/40 grid place-items-center">
              <Radio className="w-4 h-4 text-red-400 animate-pulse" />
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-black">In-Play</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Live cricket action + what's next on the schedule.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          <span>{live.length} live · {upcoming.length} upcoming</span>
        </div>
      </div>

      {/* Featured: Virtual Cricket arena */}
      <Link
        to="/virtual"
        data-testid="virtual-cta"
        className="block card-surface p-4 md:p-5 relative overflow-hidden group hover:border-yellow-400/40 transition"
      >
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-yellow-500/20 blur-3xl pointer-events-none" />
        <div className="absolute top-3 right-3">
          <span className="chip !bg-yellow-500/15 !border-yellow-400/50 !text-yellow-300 text-[10px] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" /> Live cricket
          </span>
        </div>
        <div className="flex items-center gap-4 relative">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/15 border border-yellow-400/50 grid place-items-center">
            <Trophy className="w-6 h-6 text-yellow-300" />
          </div>
          <div className="flex-1">
            <div className="font-heading font-black text-lg leading-tight">Virtual Cricket Arena</div>
            <div className="text-xs text-slate-400 mt-0.5">Simulated T5 matches every few minutes · Bet on Winner, Toss & Total Runs · Mid-match cashout</div>
          </div>
          <div className="hidden md:flex items-center gap-1 text-cyan-300 text-sm font-semibold">
            Enter arena <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist">
        <TabButton active={tab === "live"}     onClick={() => setTab("live")}     testid="inplay-tab-live">
          <Radio className={`w-3.5 h-3.5 ${tab === "live" ? "text-red-400 animate-pulse" : ""}`} />
          Live <span className="opacity-60">({live.length})</span>
        </TabButton>
        <TabButton active={tab === "upcoming"} onClick={() => setTab("upcoming")} testid="inplay-tab-upcoming">
          <Calendar className="w-3.5 h-3.5" />
          Upcoming <span className="opacity-60">({upcoming.length})</span>
        </TabButton>
      </div>

      {/* Content */}
      {loading ? (
        <div className="card-surface p-10 text-center text-slate-400 inline-flex items-center gap-2 w-full justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Fetching cricket data…
        </div>
      ) : err ? (
        <div className="card-surface p-6 text-center text-red-300 border border-red-500/30">{err}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4" data-testid="inplay-grid">
          <AnimatePresence mode="popLayout">
            {rows.map((m) => <MatchCard key={m.id} match={m} onOpen={() => setOpenMatch(m)} />)}
          </AnimatePresence>
          {rows.length === 0 && (
            <div className="col-span-full card-surface p-8 text-center text-slate-400">
              No {tab} matches right now — check back soon.
            </div>
          )}
        </div>
      )}

      <ScorecardModal match={openMatch} onClose={() => setOpenMatch(null)} />

      <div className="text-[11px] text-slate-500 pt-2 flex items-center gap-1">
        <Coins className="w-3 h-3" /> View-only for now — match betting arrives soon.
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-2 transition
        ${active ? "bg-cyan-500/15 border border-cyan-400/50 text-cyan-200" : "border border-white/10 text-slate-300 hover:border-white/20"}`}
    >
      {children}
    </button>
  );
}

function MatchCard({ match, onOpen }) {
  const isLive = match.status === "live";
  const [t1, t2] = match.teams;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      whileHover={{ y: -2 }}
      onClick={onOpen}
      data-testid={`match-card-${match.id}`}
      className="card-surface p-4 text-left relative overflow-hidden group"
    >
      {/* accent glow */}
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl opacity-30 pointer-events-none ${isLive ? "bg-red-500" : "bg-cyan-500"}`} />

      <div className="flex items-center justify-between relative">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded border border-white/10">{match.format}</span>
          <span className="truncate max-w-[180px]">{match.series}</span>
        </div>
        {isLive ? (
          <span className="chip !bg-red-500/15 !border-red-400/50 !text-red-300 text-[10px] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Live
          </span>
        ) : (
          <span className="chip !bg-cyan-500/10 !border-cyan-400/40 !text-cyan-300 text-[10px] uppercase">
            <Clock className="w-3 h-3" /> Upcoming
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2.5 relative">
        <TeamRow team={t1} isLive={isLive} batting={isLive && match.currentBatting?.startsWith(t1.short)} />
        <div className="text-center text-[10px] uppercase tracking-widest text-slate-500">vs</div>
        <TeamRow team={t2} isLive={isLive} batting={isLive && match.currentBatting?.startsWith(t2.short)} />
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {match.venue.split(",")[0]}</span>
        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {match.startTime}</span>
      </div>

      {match.matchNotes && (
        <div className={`mt-2 text-[11px] font-mono ${isLive ? "text-yellow-300" : "text-slate-400"}`}>
          {match.matchNotes}
        </div>
      )}
    </motion.button>
  );
}

function TeamRow({ team, isLive, batting }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-lg leading-none">
        {team.flag}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-bold text-sm truncate flex items-center gap-1.5">
          {team.name}
          {batting && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/15 border border-yellow-400/40 text-yellow-300 uppercase tracking-widest">Batting</span>}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">{team.short}</div>
      </div>
      {isLive ? (
        <div className="text-right font-mono">
          <div className="text-lg font-bold text-slate-100 leading-none">
            {team.score ?? "—"}<span className="text-slate-500 text-xs">/{team.wickets ?? 0}</span>
          </div>
          <div className="text-[10px] text-slate-400">{team.overs ?? 0} ov</div>
        </div>
      ) : (
        <div className="text-[10px] text-slate-500">—</div>
      )}
    </div>
  );
}

function ScorecardModal({ match, onClose }) {
  if (!match) return null;
  const isLive = match.status === "live";
  const [t1, t2] = match.teams;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="scorecard-modal"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="card-surface w-full max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          data-testid="scorecard-close-btn"
          className="absolute top-3 right-3 w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 grid place-items-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded border border-white/10">{match.format}</span>
          <span>{match.series}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {isLive ? (
            <span className="chip !bg-red-500/15 !border-red-400/50 !text-red-300 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Live
            </span>
          ) : (
            <span className="chip !bg-cyan-500/10 !border-cyan-400/40 !text-cyan-300 text-[10px]">
              <Clock className="w-3 h-3" /> Upcoming
            </span>
          )}
          <span className="text-xs text-slate-400">{match.startTime}</span>
        </div>

        <div className="mt-5 space-y-3">
          <TeamRow team={t1} isLive={isLive} batting={isLive && match.currentBatting?.startsWith(t1.short)} />
          <TeamRow team={t2} isLive={isLive} batting={isLive && match.currentBatting?.startsWith(t2.short)} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <InfoRow icon={MapPin}  label="Venue" value={match.venue} />
          <InfoRow icon={Clock}   label="Time"  value={match.startTime} />
          {match.toss    && <InfoRow icon={Trophy} label="Toss"    value={match.toss} />}
          {match.weather && <InfoRow icon={Zap}    label="Weather" value={match.weather} />}
        </div>

        {match.matchNotes && (
          <div className={`mt-5 rounded-lg border p-3 text-sm ${isLive ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-200" : "border-white/10 bg-white/5 text-slate-300"}`}>
            {match.matchNotes}
          </div>
        )}

        <div className="mt-5 text-[11px] text-slate-500 inline-flex items-center gap-1">
          <Users className="w-3 h-3" /> Match betting coming soon
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 inline-flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xs text-slate-200 mt-1">{value}</div>
    </div>
  );
}
