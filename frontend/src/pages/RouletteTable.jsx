import { Link, useParams, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BellRing, Users, Sparkles } from "lucide-react";
import { rouletteTables } from "./RouletteLobby";

export default function RouletteTable() {
  const { tableId } = useParams();
  const table = rouletteTables.find((t) => t.id === tableId);

  if (!table) return <Navigate to="/games/roulette" replace />;

  const Icon = table.icon;

  return (
    <div className="space-y-6" data-testid={`roulette-table-page-${table.id}`}>
      <div>
        <Link
          to="/games/roulette"
          data-testid="back-to-roulette-lobby"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Roulette Lobby
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card-surface overflow-hidden"
      >
        <div className={`relative aspect-[16/9] md:aspect-[21/8] w-full overflow-hidden bg-gradient-to-br ${table.gradient}`}>
          <img
            src={table.image}
            alt={table.name}
            className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.55), transparent 55%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              className="mb-3"
            >
              <Icon
                className="w-16 h-16 md:w-24 md:h-24 text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.4)]"
                strokeWidth={1.4}
              />
            </motion.div>
            <h1 className="font-heading text-2xl md:text-4xl font-black text-white drop-shadow">
              {table.name}
            </h1>
            <p className="text-white/85 text-sm md:text-base mt-1">{table.tagline}</p>
            <span className="mt-3 chip !bg-black/50 !border-red-400/60 !text-red-200 text-[11px] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Live
            </span>
          </div>
        </div>

        <div className="p-4 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Stat label="Players" value={table.players} icon={Users} />
          <Stat label="Min Bet" value={`₹${table.min}`} icon={Sparkles} />
          <Stat label="Max Bet" value={`₹${table.max.toLocaleString()}`} icon={Sparkles} />
          <Stat label="Status" value="Live" icon={BellRing} valueClass="text-red-300" />
        </div>
      </motion.div>

      <div className="card-surface p-5 md:p-8 text-center" data-testid="roulette-coming-soon">
        <div className="inline-flex items-center gap-2 chip !bg-cyan-500/10 !border-cyan-400/40 !text-cyan-300 text-[11px] uppercase">
          <BellRing className="w-3.5 h-3.5" /> Gameplay launching soon
        </div>
        <h2 className="font-heading text-xl md:text-2xl font-black mt-3">
          Table opens shortly
        </h2>
        <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
          {table.name} is being dealt in. Live betting, real-time wheel spins and multipliers
          drop here soon. We&apos;ll notify you the moment seats open.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/game"
            data-testid="play-aerox-cta"
            className="btn-primary text-sm px-4 py-2"
          >
            Play AeroX Crash meanwhile
          </Link>
          <Link
            to="/games/roulette"
            data-testid="back-to-lobby-cta"
            className="chip !text-slate-300 hover:!text-white"
          >
            Browse other tables
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, valueClass = "" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-1 font-heading text-lg md:text-xl font-bold ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
