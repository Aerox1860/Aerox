import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Zap, Flame, Crown, Dice5, Sparkles, Orbit } from "lucide-react";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import { useGamesStatus } from "@/lib/useGamesStatus";

const tables = [
  {
    id: "hindi-roulette",
    name: "Hindi Roulette",
    tagline: "Live dealer in Hindi",
    min: 10,
    max: 50000,
    players: 128,
    tags: ["Live", "Hindi"],
    icon: Crown,
    gradient: "from-orange-500 via-red-500 to-rose-700",
    accent: "text-orange-200",
    image:
      "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "lightning-roulette",
    name: "Lightning Roulette",
    tagline: "Up to 500x multipliers",
    min: 20,
    max: 100000,
    players: 342,
    tags: ["500x", "Electric"],
    icon: Zap,
    gradient: "from-violet-500 via-purple-500 to-fuchsia-600",
    accent: "text-violet-200",
    image:
      "https://images.unsplash.com/photo-1518544801976-3e159e50e5bb?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "american-roulette",
    name: "American Roulette",
    tagline: "Double zero classic",
    min: 10,
    max: 25000,
    players: 87,
    tags: ["Classic", "00"],
    icon: Orbit,
    gradient: "from-red-500 via-rose-600 to-red-800",
    accent: "text-red-200",
    image:
      "https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "mega-fire-blaze-roulette",
    name: "Mega Fire Blaze Roulette",
    tagline: "Blazing jackpot rounds",
    min: 50,
    max: 200000,
    players: 214,
    tags: ["Jackpot", "Fire"],
    icon: Flame,
    gradient: "from-amber-500 via-orange-600 to-red-700",
    accent: "text-amber-200",
    image:
      "https://images.unsplash.com/photo-1518709779341-56cf4535e94b?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "speed-sic-bo",
    name: "Speed Sic Bo",
    tagline: "3 dice, 30-second rounds",
    min: 10,
    max: 30000,
    players: 96,
    tags: ["Dice", "Speed"],
    icon: Dice5,
    gradient: "from-emerald-500 via-teal-600 to-cyan-700",
    accent: "text-emerald-200",
    image:
      "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "bucharest-quantum-roulette",
    name: "Bucharest Quantum Roulette",
    tagline: "Quantum boosted multipliers",
    min: 20,
    max: 80000,
    players: 156,
    tags: ["Quantum", "Live"],
    icon: Sparkles,
    gradient: "from-cyan-400 via-sky-500 to-indigo-700",
    accent: "text-cyan-200",
    image:
      "https://images.unsplash.com/photo-1596731498067-15f83e6dc5f5?auto=format&fit=crop&w=800&q=60",
  },
  {
    id: "arabic-roulette",
    name: "Arabic Roulette",
    tagline: "Live dealer in Arabic",
    min: 10,
    max: 50000,
    players: 74,
    tags: ["Live", "Arabic"],
    icon: Crown,
    gradient: "from-yellow-500 via-amber-600 to-yellow-800",
    accent: "text-yellow-200",
    image:
      "https://images.unsplash.com/photo-1596548438137-d51ea5c83ca5?auto=format&fit=crop&w=800&q=60",
  },
];

export default function RouletteLobby() {
  const gs = useGamesStatus();
  if (gs.ready && gs.roulette === false) {
    return <MaintenanceScreen gameName="Roulette" backTo="/games" />;
  }
  return (
    <div className="space-y-6" data-testid="roulette-lobby-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            to="/games"
            data-testid="back-to-games"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Games
          </Link>
          <h1 className="font-heading text-2xl md:text-3xl font-black mt-1">
            Roulette <span className="text-red-400">Live</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Pick a table. Live dealers, real multipliers, instant payouts.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 chip !bg-red-500/10 !border-red-400/40 !text-red-300 text-[11px] uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          {tables.reduce((s, t) => s + t.players, 0)} playing now
        </div>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
        data-testid="roulette-tables-grid"
      >
        {tables.map((t, idx) => (
          <TableCard key={t.id} table={t} index={idx} />
        ))}
      </div>
    </div>
  );
}

function TableCard({ table, index }) {
  const Icon = table.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <Link
        to={`/games/roulette/${table.id}`}
        data-testid={`roulette-table-${table.id}`}
        className="group card-surface overflow-hidden block hover:border-red-500/50 transition-all hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(244,63,94,0.18)]"
      >
        <div className={`relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br ${table.gradient}`}>
          {/* Background image */}
          <img
            src={table.image}
            alt={table.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay group-hover:opacity-55 transition-opacity"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          {/* radial vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.55), transparent 55%)",
            }}
          />
          {/* Icon centerpiece */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon
              className="w-14 h-14 md:w-16 md:h-16 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.35)] group-hover:scale-110 transition-transform"
              strokeWidth={1.5}
            />
          </div>
          {/* Live badge */}
          <span className="absolute top-2 left-2 chip !bg-black/60 !border-red-400/60 !text-red-300 text-[10px] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Live
          </span>
          {/* Players badge */}
          <span className="absolute top-2 right-2 chip !bg-black/60 !border-white/20 !text-slate-200 text-[10px]">
            <Users className="w-3 h-3" /> {table.players}
          </span>
        </div>

        <div className="p-3 md:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-heading font-bold text-sm md:text-base truncate">
                {table.name}
              </div>
              <div className={`text-[11px] md:text-xs mt-0.5 truncate ${table.accent}`}>
                {table.tagline}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {table.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-slate-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
              ₹{table.min} – ₹{table.max.toLocaleString()}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export { tables as rouletteTables };
