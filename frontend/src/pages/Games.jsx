import { Link } from "react-router-dom";
import { Plane, Bomb, Dices, Disc, TrendingDown, CircleDot, Grid3x3, Spade, Sparkles, Lock, Play } from "lucide-react";

const games = [
  {
    id: "aerox",
    name: "AeroX Crash",
    tagline: "Fly high. Cash out before it crashes.",
    icon: Plane,
    to: "/game",
    status: "live",
    gradient: "from-cyan-500 to-green-500",
    accent: "text-cyan-300",
    accentBg: "bg-cyan-500/10",
    tags: ["Multiplayer", "Real-time"],
  },
  { id: "mines", name: "Mines", tagline: "Uncover gems. Avoid bombs.", icon: Bomb, gradient: "from-orange-500 to-red-600", tags: ["Skill"] },
  { id: "dice", name: "Dice", tagline: "Roll for glory.", icon: Dices, gradient: "from-fuchsia-500 to-purple-600", tags: ["Classic"] },
  { id: "roulette", name: "Roulette", tagline: "Red or Black?", icon: Disc, gradient: "from-red-500 to-rose-700", tags: ["Table"] },
  { id: "plinko", name: "Plinko", tagline: "Drop the ball, chase the peak.", icon: TrendingDown, gradient: "from-emerald-400 to-teal-600", tags: ["Casual"] },
  { id: "wheel", name: "Wheel of Fortune", tagline: "Spin for the multiplier.", icon: CircleDot, gradient: "from-amber-400 to-yellow-600", tags: ["Fun"] },
  { id: "slots", name: "Neon Slots", tagline: "3-reel arcade classic.", icon: Grid3x3, gradient: "from-pink-500 to-fuchsia-600", tags: ["Reels"] },
  { id: "blackjack", name: "Blackjack", tagline: "21 or bust.", icon: Spade, gradient: "from-slate-300 to-slate-600", tags: ["Cards"] },
  { id: "baccarat", name: "Baccarat", tagline: "Player. Banker. Tie.", icon: Sparkles, gradient: "from-indigo-400 to-blue-700", tags: ["Cards"] },
];

export default function Games() {
  return (
    <div className="space-y-6" data-testid="games-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black">Games</h1>
        <p className="text-slate-400 text-sm mt-1">Pick a game to play. More arriving every week.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4" data-testid="games-grid">
        {games.map((g) => <GameCard key={g.id} game={g} />)}
      </div>
    </div>
  );
}

function GameCard({ game }) {
  const Icon = game.icon;
  const live = game.status === "live";

  const inner = (
    <div className="relative h-full">
      {/* Illustration area */}
      <div className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br ${game.gradient}`}>
        {/* pattern overlay */}
        <div className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.4), transparent 50%)" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-16 h-16 md:w-20 md:h-20 text-white/95 drop-shadow-[0_0_20px_rgba(255,255,255,0.35)]" strokeWidth={1.6} />
        </div>
        {live ? (
          <span className="absolute top-2 left-2 chip !bg-black/50 !border-green-400/60 !text-green-300 text-[10px] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
          </span>
        ) : (
          <span className="absolute top-2 left-2 chip !bg-black/60 !border-white/20 !text-slate-200 text-[10px] uppercase">
            <Lock className="w-3 h-3" /> Soon
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 md:p-4">
        <div className="font-heading font-bold text-sm md:text-base truncate">{game.name}</div>
        <div className="text-[11px] md:text-xs text-slate-400 mt-0.5 truncate">{game.tagline}</div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {game.tags?.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-slate-400">{t}</span>
            ))}
          </div>
          {live ? (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${game.accent || "text-cyan-300"}`}>
              <Play className="w-3 h-3" /> Play
            </span>
          ) : (
            <span className="text-[10px] text-slate-500">Coming soon</span>
          )}
        </div>
      </div>
    </div>
  );

  if (live && game.to) {
    return (
      <Link to={game.to} data-testid={`game-card-${game.id}`}
        className="card-surface overflow-hidden hover:border-cyan-500/50 transition-all hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)]">
        {inner}
      </Link>
    );
  }
  return (
    <div data-testid={`game-card-${game.id}`}
      className="card-surface overflow-hidden opacity-80 grayscale-[0.2] cursor-not-allowed">
      {inner}
    </div>
  );
}
