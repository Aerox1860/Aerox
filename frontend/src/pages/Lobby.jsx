import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio, Zap, Dices, Sparkles, Trophy, Gift, Plane,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * White-body lobby (govinda365-style). Now:
 *   • Full-bleed on mobile — no side padding, edge-to-edge sections.
 *   • The Category chips, Provider chips, and Popular-Games strip all
 *     auto-scroll LEFT forever using the `marquee-track` CSS animation.
 *     Hovering pauses it, so users can still click.
 *   • Chips carry per-item colour so the row is vibrant, not flat gray.
 */

const CATEGORIES = [
  { key: "cricket",  label: "Cricket",      icon: Radio,    to: "/in-play",       tone: "bg-emerald-500 text-white" },
  { key: "football", label: "Football",     icon: Sparkles, to: "/football",      tone: "bg-cyan-500 text-white" },
  { key: "horse",    label: "Horse Racing", icon: Trophy,   to: "/horse-racing",  tone: "bg-amber-500 text-white" },
  { key: "aviator",  label: "Aviator",      icon: Plane,    to: "/aviator",       tone: "bg-fuchsia-500 text-white" },
  { key: "casino",   label: "Casino",       icon: Dices,    to: "/games",         tone: "bg-red-500 text-white" },
  { key: "virtual",  label: "Virtual",      icon: Zap,      to: "/virtual",       tone: "bg-orange-500 text-white" },
];

const PROVIDERS = [
  { label: "Betsoft",     tone: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "Betgames.tv", tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { label: "Mac88",       tone: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "Gamzix",      tone: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
  { label: "Evoplay",     tone: "bg-red-100 text-red-700 border-red-200" },
  { label: "Fun Games",   tone: "bg-cyan-100 text-cyan-700 border-cyan-200" },
];

const SUB_TABS = [
  { key: "popular",  label: "Popular",      active: "bg-amber-400 text-slate-900", idle: "bg-amber-50 text-amber-800" },
  { key: "new",      label: "New Launch",   active: "bg-emerald-500 text-white",   idle: "bg-emerald-50 text-emerald-800" },
  { key: "indian",   label: "Indian Games", active: "bg-orange-500 text-white",    idle: "bg-orange-50 text-orange-800" },
  { key: "roulette", label: "Roulette",     active: "bg-red-500 text-white",       idle: "bg-red-50 text-red-800" },
  { key: "aesexy",   label: "AE Sexy",      active: "bg-pink-500 text-white",      idle: "bg-pink-50 text-pink-800" },
  { key: "slots",    label: "Slots",        active: "bg-fuchsia-500 text-white",   idle: "bg-fuchsia-50 text-fuchsia-800" },
];

const GAME_TILES = [
  { id: "aviator",  title: "Aviator",         subtitle: "Crash game",       to: "/aviator",         tint: "from-cyan-500 to-emerald-500",    icon: Plane },
  { id: "virtual",  title: "Virtual Cricket", subtitle: "Live T20 markets", to: "/virtual",         tint: "from-amber-500 to-orange-500",    icon: Zap },
  { id: "roulette", title: "Roulette",        subtitle: "7 live tables",    to: "/games/roulette",  tint: "from-red-500 to-rose-600",        icon: Dices },
  { id: "mines",    title: "Mines",           subtitle: "Coming soon",      to: null,               tint: "from-fuchsia-500 to-purple-600",  icon: Sparkles, soon: true },
  { id: "plinko",   title: "Plinko",          subtitle: "Coming soon",      to: null,               tint: "from-teal-500 to-emerald-600",    icon: Trophy,   soon: true },
  { id: "dice",     title: "Dice",            subtitle: "Coming soon",      to: null,               tint: "from-orange-500 to-red-600",      icon: Dices,    soon: true },
  { id: "slots",    title: "Neon Slots",      subtitle: "Coming soon",      to: null,               tint: "from-pink-500 to-fuchsia-600",    icon: Sparkles, soon: true },
];

export default function Lobby() {
  const { user, refresh } = useAuth();
  const [activeSub, setActiveSub] = useState("popular");
  const [featured, setFeatured] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await api.get("/featured/matches");
        if (mounted) setFeatured(Array.isArray(data) ? data : []);
      } catch {}
    };
    load();
    const t = setInterval(load, 15000);
    const j = setInterval(() => setTick((n) => n + 1), 2000);
    return () => { mounted = false; clearInterval(t); clearInterval(j); };
  }, []);

  const claimDaily = async () => {
    try {
      const { data } = await api.post("/auth/daily-bonus");
      const gained = parseFloat(data.user.balance) - parseFloat(user.balance);
      toast.success(`Daily bonus credited: ₹${Math.max(0, gained).toFixed(0)}`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Already claimed today");
    }
  };

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="lobby-white">
      <div className="max-w-6xl mx-auto py-3 space-y-4">
        {/* ── Category chips (auto-scroll left, endless) ──────────────── */}
        <MarqueeRow duration="35s" testid="cat-marquee">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              to={c.to}
              data-testid={`cat-${c.key}`}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${c.tone} hover:brightness-105`}
            >
              <c.icon className="w-4 h-4" strokeWidth={2.2} />
              <span>{c.label}</span>
            </Link>
          ))}
        </MarqueeRow>

        {/* ── Provider chips (auto-scroll left, endless) ──────────────── */}
        <MarqueeRow duration="40s" testid="providers-marquee">
          {PROVIDERS.map((p) => (
            <div
              key={p.label}
              data-testid={`provider-${p.label.toLowerCase().replace(/\W+/g, "-")}`}
              className={`shrink-0 px-3 py-1.5 rounded-md border text-[11px] uppercase tracking-widest font-bold ${p.tone}`}
            >
              {p.label}
            </div>
          ))}
        </MarqueeRow>

        {/* ── Sub-category tabs (static, tappable) ───────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x px-4">
          {SUB_TABS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSub(s.key)}
              data-testid={`sub-${s.key}`}
              className={`shrink-0 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${activeSub === s.key ? s.active : s.idle}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Popular games (auto-scroll left, endless) ──────────────── */}
        <section data-testid="games-carousel">
          <SectionHeader title="Popular Games" cta={{ to: "/games", label: "See all" }} />
          <MarqueeRow duration="45s" testid="games-marquee" gap="gap-3">
            {GAME_TILES.map((g) => <GameTile key={g.id} {...g} />)}
          </MarqueeRow>
        </section>

        {/* ── Fantasy strip ─────────────────────────────────────────── */}
        <section data-testid="fantasy-strip" className="px-4">
          <SectionHeader title="Fantasy Sports" flush />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FantasyChip icon={Radio}    label="Cricket 11"   to="/virtual"      tone="bg-emerald-500 text-white" />
            <FantasyChip icon={Sparkles} label="Football 11"  to="/football"     tone="bg-cyan-500 text-white" />
            <FantasyChip icon={Trophy}   label="Horse Racing" to="/horse-racing" tone="bg-amber-500 text-white" />
            <FantasyChip icon={Dices}    label="More"         to="/games"        tone="bg-slate-800 text-white" />
          </div>
        </section>

        {/* ── Daily bonus ───────────────────────────────────────────── */}
        <section className="mx-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-4 flex items-center gap-3" data-testid="daily-bonus-card">
          <div className="w-10 h-10 rounded-lg bg-amber-400 grid place-items-center shrink-0 shadow-md">
            <Gift className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">Daily bonus</div>
            <div className="text-xs text-slate-600 truncate">Claim ₹10 free every 24 hours — no deposit needed.</div>
          </div>
          <button
            onClick={claimDaily}
            data-testid="claim-bonus-btn"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg shrink-0"
          >
            Claim
          </button>
        </section>

        {/* ── In-Play list ──────────────────────────────────────────── */}
        <section data-testid="inplay-matches" className="px-4">
          <SectionHeader
            title="In-Play"
            cta={{ to: "/in-play", label: "All matches" }}
            right={<span className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">MO · BM · F</span>}
            flush
          />
          {featured.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400 text-sm" data-testid="no-featured">
              No live matches right now. Check back soon or explore Virtual Cricket.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              {featured.map((m, i) => <CompactMatchRow key={m.id} match={m} tick={tick} seed={i + 1} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function SectionHeader({ title, cta, right, flush }) {
  return (
    <div className={`flex items-end justify-between mb-2 pt-1 ${flush ? "" : "px-4"}`}>
      <h2 className="font-heading font-bold text-slate-900 text-base sm:text-lg">{title}</h2>
      {right ? right : (cta && (
        <Link to={cta.to} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700">
          {cta.label} →
        </Link>
      ))}
    </div>
  );
}

/** Endless left-scrolling row. Renders children twice so the loop is
 *  seamless. Consumer supplies a CSS duration (e.g. "35s"). */
function MarqueeRow({ children, duration = "30s", gap = "gap-2", testid }) {
  return (
    <div className="relative overflow-hidden w-full" data-testid={testid}>
      <div className={`marquee-track ${gap}`} style={{ "--marquee-duration": duration }}>
        <div className={`flex ${gap} pr-3 shrink-0`}>{children}</div>
        <div className={`flex ${gap} pr-3 shrink-0`} aria-hidden>{children}</div>
      </div>
    </div>
  );
}

function GameTile({ title, subtitle, to, tint, icon: Icon, soon }) {
  const inner = (
    <div className={`w-40 sm:w-48 shrink-0 rounded-xl overflow-hidden shadow-md border border-slate-200 bg-white transition-transform ${to ? "hover:-translate-y-0.5" : "opacity-90"}`} data-testid={`game-tile-${title.toLowerCase().replace(/\s+/g,"-")}`}>
      <div className={`relative h-24 sm:h-28 bg-gradient-to-br ${tint} grid place-items-center`}>
        <Icon className="w-9 h-9 text-white drop-shadow-md" strokeWidth={2} />
        {soon && (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/40 text-white">Soon</span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : <div>{inner}</div>;
}

function FantasyChip({ icon: Icon, label, to, tone }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-3 rounded-xl shadow-sm hover:shadow-md transition-shadow ${tone}`}
      data-testid={`fantasy-chip-${label.toLowerCase().replace(/\s+/g,"-")}`}
    >
      <Icon className="w-5 h-5" strokeWidth={2} />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

/* ── Compact In-Play row (mirrors the /in-play page layout) ────── */

const JITTER_MAX = 0.06;
const jitter = (v) => {
  if (v == null) return null;
  const d = (Math.random() - 0.5) * 2 * JITTER_MAX;
  return Math.max(1.01, +(v + d).toFixed(2));
};
const pseudoVol = (seed, tick) => (((seed * 9301 + tick * 49297) % 20000) + 500);
const formatVol = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v));

function ColHeaderTiny({ label, tone }) {
  return <div className={`w-[62px] sm:w-[70px] text-center py-0.5 rounded-md text-[9px] font-bold ${tone}`}>{label}</div>;
}

function CompactMatchRow({ match, tick, seed }) {
  const mo_back = jitter(match.odds_team1_back);
  const mo_lay  = jitter(match.odds_team1_lay);
  const bm_back = jitter(match.odds_team2_back);
  const bm_lay  = jitter(match.odds_team2_lay);
  const f_back  = jitter(match.odds_draw);
  const time = match.match_time ? new Date(match.match_time) : null;
  const day  = time ? time.toLocaleDateString(undefined, { weekday: "short" }) : "Today";
  const hh   = time ? time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <Link
      to="/in-play"
      data-testid={`match-row-${match.id}`}
      className="grid grid-cols-[48px_1fr_auto] items-center gap-2 px-2 py-2 hover:bg-slate-50 active:bg-slate-100"
    >
      {/* Column 1: time */}
      <div className="text-[10.5px] leading-tight">
        <span className="text-[8.5px] font-bold px-1 py-0.5 rounded bg-red-500 text-white uppercase tracking-widest">Live</span>
        <div className="mt-0.5 text-slate-500 font-semibold">{day}</div>
        <div className="font-bold text-slate-900">{hh}</div>
      </div>

      {/* Column 2: teams + tags */}
      <div className="min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <TinyPill label="MO" tone="bg-emerald-500 text-white" />
          <TinyPill label="BM" tone="bg-sky-500 text-white" />
          <TinyPill label="F"  tone="bg-orange-500 text-white" />
          <TinyPill label="▶"  tone="bg-slate-900 text-white" />
        </div>
        <div className="text-[12px] font-semibold text-slate-900 leading-tight mt-0.5 truncate">{match.team1_name}</div>
        <div className="text-[12px] font-semibold text-slate-900 leading-tight truncate">{match.team2_name}</div>
        {match.tournament && (
          <div className="text-[9.5px] text-slate-500 truncate">{match.tournament}</div>
        )}
      </div>

      {/* Column 3: odds */}
      <div className="flex items-center gap-0.5">
        <CompactOddsPair back={mo_back} lay={mo_lay} vol={pseudoVol(seed * 3,     tick)} />
        <CompactOddsPair back={bm_back} lay={bm_lay} vol={pseudoVol(seed * 3 + 1, tick)} />
        <CompactOddsPair back={f_back}  lay={null}    vol={pseudoVol(seed * 3 + 2, tick)} single />
      </div>
    </Link>
  );
}

function TinyPill({ label, tone }) {
  return <span className={`inline-block px-1 py-[1px] rounded text-[8px] font-bold uppercase tracking-widest ${tone}`}>{label}</span>;
}

function CompactOddsPair({ back, lay, vol, single }) {
  return (
    <div className="flex gap-[1px]">
      <CompactOddsCell value={back} tone="blue" vol={vol} />
      {!single && <CompactOddsCell value={lay} tone="pink" vol={vol + 250} />}
      {single && <CompactOddsCell value={null} tone="blue" vol={null} placeholder />}
    </div>
  );
}

function CompactOddsCell({ value, tone, vol, placeholder }) {
  const empty = value == null;
  const bg = empty
    ? "bg-slate-100 text-slate-400 border-slate-200"
    : tone === "blue"
    ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-pink-100 text-pink-800 border-pink-200";
  return (
    <div className={`w-[28px] sm:w-[34px] h-[38px] rounded border ${bg} px-0.5 py-0.5 flex flex-col items-center justify-center`}>
      <div className={`text-[10.5px] font-bold leading-none ${empty ? "opacity-70" : ""}`}>{empty ? "-" : value.toFixed(2)}</div>
      {!empty && vol != null && (
        <div className="text-[8px] mt-0.5 leading-none opacity-70 font-mono">{formatVol(vol)}</div>
      )}
      {placeholder && <div className="text-[8px] opacity-0">-</div>}
    </div>
  );
}
