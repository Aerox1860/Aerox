import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio, Zap, Dices, Sparkles, Trophy, Gift, Plane, ChevronLeft, ChevronRight, Clock
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Redesigned Lobby dashboard inspired by the reference (govinda365-style).
 *
 * Sections top-to-bottom:
 *   1. Horizontal sport-category tabs (Cricket, Football, Horse Racing, etc.)
 *   2. Provider chips row
 *   3. Sub-category tabs (Popular, New, Roulette, Slots ...)
 *   4. Horizontal-scroll game card carousel
 *   5. "In-Play" cricket matches list (admin-managed via `/featured/matches`)
 *
 * Body is set to a WHITE background (as user requested) via a wrapping div
 * that overrides the app's dark theme locally.
 */

const CATEGORIES = [
  { key: "cricket",     label: "Cricket",       icon: Radio,     to: "/in-play" },
  { key: "football",    label: "Football",      icon: Sparkles,  to: "/football" },
  { key: "horse",       label: "Horse Racing",  icon: Trophy,    to: "/horse-racing" },
  { key: "aviator",     label: "Aviator",       icon: Plane,     to: "/aviator" },
  { key: "casino",      label: "Casino",        icon: Dices,     to: "/games" },
  { key: "virtual",     label: "Virtual",       icon: Zap,       to: "/virtual" },
];

const PROVIDERS = ["Betsoft", "Betgames.tv", "Mac88", "Gamzix", "Evoplay", "Fun Games"];

const SUB_TABS = [
  { key: "popular",       label: "Popular" },
  { key: "new",           label: "New Launch" },
  { key: "indian",        label: "Indian Games" },
  { key: "roulette",      label: "Roulette" },
  { key: "aesexy",        label: "AE Sexy" },
  { key: "slots",         label: "Slots" },
];

// Playable / soon-playable game tiles that fill the horizontal carousel.
const GAME_TILES = [
  { id: "aviator",   title: "Aviator",         subtitle: "Crash game",       to: "/aviator",           tint: "from-cyan-500 to-emerald-500", icon: Plane },
  { id: "virtual",   title: "Virtual Cricket", subtitle: "Live T20 markets", to: "/virtual",           tint: "from-amber-500 to-orange-500",   icon: Zap },
  { id: "roulette",  title: "Roulette",        subtitle: "7 live tables",    to: "/games/roulette",   tint: "from-red-500 to-rose-600",       icon: Dices },
  { id: "mines",     title: "Mines",           subtitle: "Coming soon",      to: null,                 tint: "from-fuchsia-500 to-purple-600", icon: Sparkles, soon: true },
  { id: "plinko",    title: "Plinko",          subtitle: "Coming soon",      to: null,                 tint: "from-teal-500 to-emerald-600",   icon: Trophy,    soon: true },
  { id: "dice",      title: "Dice",            subtitle: "Coming soon",      to: null,                 tint: "from-orange-500 to-red-600",     icon: Dices,     soon: true },
  { id: "slots",     title: "Neon Slots",      subtitle: "Coming soon",      to: null,                 tint: "from-pink-500 to-fuchsia-600",   icon: Sparkles,  soon: true },
];

export default function Lobby() {
  const { user, refresh } = useAuth();
  const [activeCat, setActiveCat] = useState("cricket");
  const [activeSub, setActiveSub] = useState("popular");
  const [featured, setFeatured] = useState([]);

  // Fetch admin-pushed live matches for the cricket in-play list.
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
    return () => { mounted = false; clearInterval(t); };
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
    <div className="bg-white text-slate-900 min-h-screen" data-testid="lobby-white">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-5">
        {/* Sport / category horizontal scroller */}
        <HorizontalScroll testid="cat-scroll">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              to={c.to}
              onClick={() => setActiveCat(c.key)}
              data-testid={`cat-${c.key}`}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCat === c.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <c.icon className="w-4 h-4" strokeWidth={2.2} />
              <span>{c.label}</span>
            </Link>
          ))}
        </HorizontalScroll>

        {/* Provider chips (decorative) */}
        <HorizontalScroll testid="providers-scroll">
          {PROVIDERS.map((p) => (
            <div
              key={p}
              data-testid={`provider-${p.toLowerCase().replace(/\W+/g, "-")}`}
              className="shrink-0 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[11px] uppercase tracking-widest text-slate-500 font-semibold"
            >
              {p}
            </div>
          ))}
        </HorizontalScroll>

        {/* Sub-category tabs */}
        <HorizontalScroll testid="subtabs-scroll">
          {SUB_TABS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSub(s.key)}
              data-testid={`sub-${s.key}`}
              className={`shrink-0 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeSub === s.key
                  ? "bg-amber-400 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </HorizontalScroll>

        {/* Game card carousel */}
        <section data-testid="games-carousel">
          <SectionHeader title="Popular Games" cta={{ to: "/games", label: "See all" }} />
          <HorizontalScroll testid="games-scroll" gap="gap-3" showArrows>
            {GAME_TILES.map((g) => (
              <GameTile key={g.id} {...g} />
            ))}
          </HorizontalScroll>
        </section>

        {/* Fantasy sports strip (decorative for now) */}
        <section data-testid="fantasy-strip">
          <SectionHeader title="Fantasy Sports" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FantasyChip icon={Radio}   label="Cricket 11"   to="/virtual" tint="bg-emerald-100 text-emerald-700" />
            <FantasyChip icon={Sparkles} label="Football 11"  to="/football" tint="bg-cyan-100 text-cyan-700" />
            <FantasyChip icon={Trophy}  label="Horse Racing" to="/horse-racing" tint="bg-amber-100 text-amber-700" />
            <FantasyChip icon={Dices}   label="More"         to="/games" tint="bg-slate-100 text-slate-700" />
          </div>
        </section>

        {/* Daily bonus card */}
        <section className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 flex items-center gap-3" data-testid="daily-bonus-card">
          <div className="w-10 h-10 rounded-lg bg-amber-400 grid place-items-center shrink-0">
            <Gift className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900">Daily bonus</div>
            <div className="text-xs text-slate-500 truncate">Claim ₹10 free every 24 hours — no deposit needed.</div>
          </div>
          <button
            onClick={claimDaily}
            data-testid="claim-bonus-btn"
            className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 shrink-0"
          >
            Claim
          </button>
        </section>

        {/* In-Play matches list (admin-pushed) */}
        <section data-testid="inplay-matches">
          <SectionHeader
            title="In-Play"
            cta={{ to: "/in-play", label: "All matches" }}
            right={<span className="text-[11px] uppercase tracking-widest text-slate-400">MO · BM · F</span>}
          />
          {featured.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-slate-400 text-sm" data-testid="no-featured">
              No live matches right now. Check back soon or explore Virtual Cricket.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {featured.map((m) => <MatchRow key={m.id} m={m} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function SectionHeader({ title, cta, right }) {
  return (
    <div className="flex items-end justify-between mb-2 pt-1">
      <h2 className="font-heading font-bold text-slate-900 text-base sm:text-lg">{title}</h2>
      {right ? right : (cta && (
        <Link to={cta.to} className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
          {cta.label} <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      ))}
    </div>
  );
}

/** Horizontal scroller with optional arrow buttons on desktop. */
function HorizontalScroll({ children, gap = "gap-2", showArrows = false, testid }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir * 260, behavior: "smooth" });
  };
  return (
    <div className="relative">
      <div ref={ref} className={`flex ${gap} overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth`} data-testid={testid}>
        {children}
      </div>
      {showArrows && (
        <>
          <button aria-label="scroll left"  className="hidden sm:grid absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-8 h-8 rounded-full bg-white/95 shadow border border-slate-200 place-items-center" onClick={() => scroll(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button aria-label="scroll right" className="hidden sm:grid absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-8 h-8 rounded-full bg-white/95 shadow border border-slate-200 place-items-center" onClick={() => scroll(1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

function GameTile({ title, subtitle, to, tint, icon: Icon, soon }) {
  const inner = (
    <div className={`w-40 sm:w-48 shrink-0 snap-start rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white transition-transform ${to ? "hover:-translate-y-0.5" : "opacity-80"}`} data-testid={`game-tile-${title.toLowerCase().replace(/\s+/g,"-")}`}>
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

function FantasyChip({ icon: Icon, label, to, tint }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors ${tint}`}
      data-testid={`fantasy-chip-${label.toLowerCase().replace(/\s+/g,"-")}`}
    >
      <Icon className="w-5 h-5" strokeWidth={2} />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

/** Single row in the In-Play matches list. Shows team names + times +
 *  MO/BM/F odds cells (matches reference exchange layout). */
function MatchRow({ m }) {
  const time = m.match_time ? new Date(m.match_time) : null;
  const timeStr = time ? time.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "TBA";
  return (
    <Link to="/in-play" className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50" data-testid={`match-row-${m.id}`}>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900 text-sm truncate">
          {m.team1_name} <span className="text-slate-400">vs</span> {m.team2_name}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
          {m.tournament && <span className="truncate">{m.tournament}</span>}
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {timeStr}</span>
          {m.is_live && <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />LIVE</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <OddsCell back={m.odds_team1_back} lay={m.odds_team1_lay} />
        <OddsCell back={m.odds_team2_back} lay={m.odds_team2_lay} />
        <OddsCell back={m.odds_draw} single />
      </div>
    </Link>
  );
}

function OddsCell({ back, lay, single }) {
  const fmt = (v) => (v == null ? "-" : Number(v).toFixed(2));
  if (single) {
    return (
      <div className="w-14 h-10 rounded bg-slate-100 grid place-items-center text-xs font-bold text-slate-700">
        {fmt(back)}
      </div>
    );
  }
  return (
    <div className="flex gap-0.5">
      <div className="w-12 h-10 rounded-l bg-blue-100 grid place-items-center text-[11px] font-bold text-blue-700">{fmt(back)}</div>
      <div className="w-12 h-10 rounded-r bg-pink-100 grid place-items-center text-[11px] font-bold text-pink-700">{fmt(lay)}</div>
    </div>
  );
}
