import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Calendar, MapPin, Coins, X, Trophy, Clock, Zap, Users } from "lucide-react";

// Mock cricket data — replace with real API later (CricketData.org / CricAPI / etc.)
// Each match:
//   id, series, format ("T20"|"ODI"|"Test"), status ("live"|"upcoming"|"completed"),
//   teams: [{name, short, flag, score?, overs?, wickets?}], venue, toss?, startTime, currentBatting?, matchNotes
const MOCK_MATCHES = [
  {
    id: "m-1",
    series: "IPL 2026",
    format: "T20",
    status: "live",
    teams: [
      { name: "Mumbai Indians",       short: "MI",  flag: "🔵", score: 184, overs: 18.2, wickets: 5 },
      { name: "Chennai Super Kings", short: "CSK", flag: "🟡", score: 127, overs: 14.1, wickets: 3 },
    ],
    venue: "Wankhede Stadium, Mumbai",
    toss: "CSK won toss, chose to bowl",
    weather: "Clear, 28°C",
    currentBatting: "CSK",
    startTime: "Today, 7:30 PM IST",
    matchNotes: "CSK needs 58 in 35 balls · Req rate 9.94",
  },
  {
    id: "m-2",
    series: "Border-Gavaskar Trophy 2026",
    format: "Test",
    status: "live",
    teams: [
      { name: "India",     short: "IND", flag: "🇮🇳", score: 342, overs: 89.4, wickets: 6 },
      { name: "Australia", short: "AUS", flag: "🇦🇺", score: 289, overs: 82.0, wickets: 10 },
    ],
    venue: "M. A. Chidambaram Stadium, Chennai",
    toss: "IND won toss, chose to bat",
    weather: "Humid, 31°C",
    currentBatting: "IND (2nd innings)",
    startTime: "Day 3 · Session 2",
    matchNotes: "IND lead by 53 runs · Rain expected in 2 hrs",
  },
  {
    id: "m-3",
    series: "The Hundred 2026",
    format: "T20",
    status: "live",
    teams: [
      { name: "London Spirit",   short: "LDS", flag: "🟣", score: 92, overs: 12.4, wickets: 2 },
      { name: "Trent Rockets",  short: "TRT",  flag: "🟠", score: 0,  overs: 0,    wickets: 0 },
    ],
    venue: "Lord's, London",
    toss: "LDS won toss, chose to bat",
    weather: "Overcast, 19°C",
    currentBatting: "LDS",
    startTime: "Ongoing",
    matchNotes: "First innings in progress",
  },
  {
    id: "m-4",
    series: "IPL 2026",
    format: "T20",
    status: "upcoming",
    teams: [
      { name: "Royal Challengers Bengaluru", short: "RCB", flag: "🔴" },
      { name: "Kolkata Knight Riders",       short: "KKR", flag: "🟣" },
    ],
    venue: "M. Chinnaswamy Stadium, Bengaluru",
    startTime: "Tomorrow, 7:30 PM IST",
    matchNotes: "Head-to-head: RCB 15 · KKR 18",
  },
  {
    id: "m-5",
    series: "ICC Champions Trophy 2026",
    format: "ODI",
    status: "upcoming",
    teams: [
      { name: "Pakistan",   short: "PAK", flag: "🇵🇰" },
      { name: "New Zealand", short: "NZ", flag: "🇳🇿" },
    ],
    venue: "Gaddafi Stadium, Lahore",
    startTime: "Feb 12, 2:30 PM IST",
    matchNotes: "Group A · Both teams unbeaten",
  },
  {
    id: "m-6",
    series: "BBL 2025-26",
    format: "T20",
    status: "upcoming",
    teams: [
      { name: "Sydney Sixers",  short: "SIX", flag: "🟪" },
      { name: "Perth Scorchers", short: "PER", flag: "🟧" },
    ],
    venue: "SCG, Sydney",
    startTime: "Feb 14, 1:45 PM IST",
    matchNotes: "Playoff qualifier",
  },
];

export default function InPlay() {
  const [matches, setMatches] = useState(MOCK_MATCHES);
  const [tab, setTab] = useState("live"); // live | upcoming
  const [openMatch, setOpenMatch] = useState(null);

  // Simulate score ticker for live matches (mock — replace with API polling)
  useEffect(() => {
    const t = setInterval(() => {
      setMatches((prev) =>
        prev.map((m) => {
          if (m.status !== "live") return m;
          const t = { ...m, teams: m.teams.map((x) => ({ ...x })) };
          const bat = m.currentBatting?.split(" ")[0];
          const idx = t.teams.findIndex((x) => x.short === bat);
          if (idx >= 0 && Math.random() > 0.5) {
            const inc = [0, 1, 1, 2, 4, 6][Math.floor(Math.random() * 6)];
            t.teams[idx].score = (t.teams[idx].score || 0) + inc;
            t.teams[idx].overs = Number(((t.teams[idx].overs || 0) + 0.1).toFixed(1));
          }
          return t;
        })
      );
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const live     = matches.filter((m) => m.status === "live");
  const upcoming = matches.filter((m) => m.status === "upcoming");
  const rows     = tab === "live" ? live : upcoming;

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

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4" data-testid="inplay-grid">
        <AnimatePresence mode="popLayout">
          {rows.map((m) => (
            <MatchCard key={m.id} match={m} onOpen={() => setOpenMatch(m)} />
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <div className="col-span-full card-surface p-8 text-center text-slate-400">
            No {tab} matches right now — check back soon.
          </div>
        )}
      </div>

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
